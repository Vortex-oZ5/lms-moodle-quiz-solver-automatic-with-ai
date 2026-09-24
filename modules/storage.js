import { STORAGE_KEYS } from './constants.js';

class StorageManager {
  constructor(){ this.cache=new Map(); this.isLoaded=false; }
  async init(){ if(this.isLoaded)return; const data=await this.getAll(); Object.entries(data).forEach(([k,v])=>this.cache.set(k,v)); this.isLoaded=true; }
  get(keys){ return new Promise(resolve=>chrome.storage.local.get(keys,resolve)); }
  getAll(){ return new Promise(resolve=>chrome.storage.local.get(null,resolve)); }
  set(obj){ Object.entries(obj).forEach(([k,v])=>this.cache.set(k,v)); return new Promise(resolve=>chrome.storage.local.set(obj,resolve)); }
  remove(keys){ if(Array.isArray(keys))keys.forEach(k=>this.cache.delete(k)); else this.cache.delete(keys); return new Promise(resolve=>chrome.storage.local.remove(keys,resolve)); }
  clear(){ this.cache.clear(); return new Promise(resolve=>chrome.storage.local.clear(resolve)); }
  async getStats(){ const r=await this.get(STORAGE_KEYS.STATS); return r[STORAGE_KEYS.STATS]||{solved:0,lastSolve:null}; }
  async incrementSolved(count=1){ const s=await this.getStats(); s.solved=Number(s.solved||0)+Number(count||0); s.lastSolve=Date.now(); await this.set({[STORAGE_KEYS.STATS]:s}); }
}
export const storageManager=new StorageManager();
export default StorageManager;
