class TelegramBridge {
  constructor({store,onReply}) {
    this.store=store; this.onReply=onReply; this.token=process.env.TELEGRAM_BOT_TOKEN; this.groupId=String(process.env.TELEGRAM_GROUP_ID||''); this.offset=0; this.running=false;
  }
  async api(method, body) {
    if(!this.token) return null;
    const r=await fetch(`https://api.telegram.org/bot${this.token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok) throw new Error(await r.text()); return r.json();
  }
  async notifyCase(c) {
    if(!this.token||!this.groupId) return null;
    const text = `${c.type==='claim_bonus'?'🎁':c.type==='reset_password'?'🔐':'🧠'} *BUTUH BANTUAN CS*\n\nKasus: \`${c.id}\`\nMember: ${c.memberName||'-'}\nUser ID: ${c.userId||'-'}\nConversation: \`${c.conversationId}\`\n\nRingkasan:\n${c.summary||'-'}\n\nPesan terakhir:\n${c.lastMessage||'-'}\n\nBalas dengan fitur *Reply* pada pesan ini. Balasan pertama akan dikirim ke member dan disimpan sebagai pengalaman.`;
    const r=await this.api('sendMessage',{chat_id:this.groupId,text,parse_mode:'Markdown'});
    const mid=r?.result?.message_id; if(mid){c.telegramMessageId=mid; this.store.data.cases[c.id]=c; this.store.save();} return mid;
  }
  async confirm(text){ if(this.token&&this.groupId) await this.api('sendMessage',{chat_id:this.groupId,text}); }
  start(){ if(!this.token||!this.groupId||this.running) return; this.running=true; this.loop(); }
  async loop(){ while(this.running){ try{ const r=await this.api('getUpdates',{offset:this.offset,timeout:25,allowed_updates:['message']}); for(const u of (r?.result||[])){this.offset=u.update_id+1; await this.handle(u.message);} }catch(e){console.error('[telegram]',e.message); await new Promise(r=>setTimeout(r,3000));} } }
  async handle(m){
    if(String(m.chat?.id)!==this.groupId || !m.reply_to_message || !m.text) return;
    const adminAllow=(process.env.TELEGRAM_ADMIN_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(adminAllow.length && !adminAllow.includes(String(m.from?.id))) return;
    const target=Object.values(this.store.data.cases).find(c=>c.telegramMessageId===m.reply_to_message.message_id && c.status==='waiting_telegram');
    if(!target){ await this.api('sendMessage',{chat_id:this.groupId,text:'Kasus tidak ditemukan, sudah selesai, atau balasan tidak menggunakan fitur Reply.',reply_to_message_id:m.message_id}); return; }
    target.status='answered_by_telegram'; target.adminReply=m.text; target.adminId=m.from?.id; target.answeredAt=new Date().toISOString(); this.store.save();
    await this.onReply(target,m.text);
  }
}
module.exports={TelegramBridge};
