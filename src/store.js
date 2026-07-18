const fs = require('fs');
const path = require('path');

class JsonStore {
  constructor(file) {
    this.file = file;
    this.data = {
      settings: {
        autoReply: true,
        autoClose: true,
        confidenceThreshold: 0.86,
        timezone: 'Asia/Jakarta',
        greetingShortcuts: { pagi:'#pagi', siang:'#siang', sore:'#sore', malam:'#malam' }
      },
      knowledge: [],
      cases: {},
      handledMessages: {},
      conversationMemory: {},
      audit: []
    };
    this.load();
  }
  load() {
    try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file,'utf8')); }
    catch (e) { console.error('[store] load failed', e.message); }
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), {recursive:true});
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data,null,2));
    fs.renameSync(tmp, this.file);
  }
  audit(type, payload={}) {
    this.data.audit.push({id: crypto.randomUUID(), type, payload, at:new Date().toISOString()});
    if (this.data.audit.length > 5000) this.data.audit = this.data.audit.slice(-5000);
    this.save();
  }
}
module.exports = { JsonStore };
