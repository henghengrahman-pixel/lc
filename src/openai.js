const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

function normalizeText(s='') {
  return s.toLowerCase().replace(/[^a-z0-9\s]/gi,' ').replace(/\s+/g,' ').trim();
}
function similarity(a,b) {
  const A = new Set(normalizeText(a).split(' ').filter(Boolean));
  const B = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hit=0; for (const x of A) if (B.has(x)) hit++;
  return hit / Math.max(A.size,B.size);
}
function heuristicIntent(text='') {
  const t=normalizeText(text);
  if (/(bonus|claim|klaim|harian)/.test(t)) return 'claim_bonus';
  if (/(reset|lupa|psw|password|sandi)/.test(t)) return 'reset_password';
  if (/(depo|deposit|dp).*(belum|blm|lom|pending|masuk)/.test(t) || /(saldo bank).*(potong)/.test(t)) return 'deposit_pending';
  if (/(wd|withdraw|widraw).*(belum|blm|lom|pending|cair|masuk)/.test(t)) return 'withdraw_pending';
  if (/(login|masuk akun).*(gak|ga|tidak|gagal|bisa)/.test(t)) return 'login_issue';
  if (/(makasih|terima kasih|thanks|sudah bisa|berhasil|selesai|sip|mantap)/.test(t)) return 'resolved';
  return 'unknown';
}

async function callOpenAI({history, knowledge}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const input = `Anda adalah mesin keputusan CS LiveChat. Baca seluruh percakapan, jangan ulangi pertanyaan yang sudah dijawab. Jangan pernah meminta OTP, PIN, atau password. Bonus dan reset password wajib requires_telegram=true. Jika tidak yakin, requires_telegram=true. Balasan singkat, sopan, bahasa Indonesia santai-profesional.\n\nKNOWLEDGE:\n${JSON.stringify(knowledge.slice(0,8))}\n\nHISTORY:\n${JSON.stringify(history)}\n\nKeluarkan JSON murni: {"intent":"...","confidence":0.0,"requires_telegram":true,"should_close_chat":false,"reply":"...","summary":"...","missing_data":[]}`;
  const res = await fetch('https://api.openai.com/v1/responses', {
    method:'POST', headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
    body: JSON.stringify({model:DEFAULT_MODEL,input,temperature:0.2,max_output_tokens:500})
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const j=await res.json();
  const txt = j.output_text || (j.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('');
  const cleaned = txt.replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  return JSON.parse(cleaned);
}

async function decide({history, knowledge=[]}) {
  const last = [...history].reverse().find(m=>m.sender==='member')?.text || '';
  const intent = heuristicIntent(last);
  const candidates = knowledge.map(k=>({...k,score:similarity(last,k.example||k.question||'')})).sort((a,b)=>b.score-a.score);
  const best=candidates[0];
  try {
    const ai = await callOpenAI({history,knowledge:candidates.slice(0,8)});
    if (ai) return {...ai, source:'openai'};
  } catch(e) { console.error('[openai]', e.message); }
  if (intent==='claim_bonus') return {intent,confidence:.99,requires_telegram:true,should_close_chat:false,reply:'',summary:'Member meminta claim bonus',source:'rules'};
  if (intent==='reset_password') return {intent,confidence:.99,requires_telegram:true,should_close_chat:false,reply:'',summary:'Member meminta reset password',source:'rules'};
  if (intent==='resolved') return {intent,confidence:.92,requires_telegram:false,should_close_chat:true,reply:'Sama-sama, Kak. Senang bisa membantu. Jika ada kendala lain, silakan hubungi kami kembali.',summary:'Member menyatakan masalah selesai',source:'rules'};
  if (best && best.score>=0.55) return {intent:best.intent||'learned',confidence:Math.min(.95,.72+best.score*.25),requires_telegram:false,should_close_chat:false,reply:best.answer,summary:'Jawaban dari pengalaman CS',source:'knowledge'};
  if (intent==='deposit_pending') return {intent,confidence:.82,requires_telegram:false,should_close_chat:false,reply:'Baik, boleh dibantu kirim username, nominal, metode pembayaran, jam transfer, dan bukti transfernya agar kami cek?',summary:'Deposit belum masuk',source:'rules'};
  if (intent==='withdraw_pending') return {intent,confidence:.82,requires_telegram:false,should_close_chat:false,reply:'Baik, boleh dibantu kirim username, nominal withdraw, dan jam pengajuan agar kami cek?',summary:'Withdraw belum masuk',source:'rules'};
  return {intent:'unknown',confidence:.35,requires_telegram:true,should_close_chat:false,reply:'',summary:'AI belum memahami maksud member',source:'fallback'};
}
module.exports={decide,heuristicIntent,similarity};
