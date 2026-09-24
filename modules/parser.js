import { hashString } from './utils.js';
export class QuestionParser {
  hashQuestion(question){
    const q=String(question?.question||'').replace(/\s+/g,' ').trim().toLowerCase();
    const options=(question?.options||[]).map(o=>String(typeof o==='string'?o:o?.text||'').replace(/\s+/g,' ').trim().toLowerCase());
    return hashString(`${q}::${options.join('::')}`);
  }
}
export const questionParser=new QuestionParser();
