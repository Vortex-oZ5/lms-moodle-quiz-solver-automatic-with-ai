/**
 * Utils - Shared helper functions
 */

export const Logger = {
  prefix: '[LMS AI Solver]',
  debugEnabled: false,
  info(...args) { console.log(this.prefix, ...args); },
  warn(...args) { console.warn(this.prefix, ...args); },
  error(...args) { console.error(this.prefix, ...args); },
  debug(...args) { if (this.debugEnabled) console.debug(this.prefix, ...args); }
};

export function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  // Prevent XSS, remove script tags, trim
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ') // strip html tags, leave text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000); // limit
}

export function sanitizeOptionText(text) {
  return sanitizeText(text).slice(0, 500);
}

export function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  if (el.offsetParent === null && style.position !== 'fixed') {
    // Check if still visible via bounding rect
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
  }
  // Check viewport
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
}

export function debounce(fn, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit
  }
  return hash.toString(36);
}

export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function getClosestQuestionContainer(element) {
  const selectors = [
    '.que',
    '.question',
    '[role="listitem"]',
    '.freebirdFormviewerComponentsQuestionBaseRoot',
    '.freebirdFormviewerViewItemsItemItem',
    '.formulation',
    'fieldset',
    '.q',
    'li',
    '.question-container',
    '.quiz-question',
    'div[class*="question"]'
  ];
  for (const sel of selectors) {
    const parent = element.closest(sel);
    if (parent) return parent;
  }
  // Fallback: 4 levels up
  let cur = element;
  for (let i = 0; i < 4; i++) {
    if (!cur.parentElement) break;
    cur = cur.parentElement;
    if (cur.children.length > 2) return cur;
  }
  return element.parentElement || element;
}

export function findLabelForInput(input) {
  if (!input) return null;
  // 1. label[for=id]
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) return label;
  }
  // 2. parent label
  const parentLabel = input.closest('label');
  if (parentLabel) return parentLabel;
  // 3. sibling label
  let sibling = input.nextElementSibling;
  if (sibling && sibling.tagName.toLowerCase() === 'label') return sibling;
  sibling = input.previousElementSibling;
  if (sibling && sibling.tagName.toLowerCase() === 'label') return sibling;
  // 4. aria-labelledby
  if (input.getAttribute('aria-labelledby')) {
    const labelId = input.getAttribute('aria-labelledby');
    const el = document.getElementById(labelId);
    if (el) return el;
  }
  // 5. Check parent container text
  return null;
}

export function extractTextFromElement(el) {
  if (!el) return '';
  // Prefer innerText but fallback
  let text = el.innerText || el.textContent || '';
  // For Google Forms ARIA
  if (!text.trim() && el.getAttribute('aria-label')) {
    text = el.getAttribute('aria-label');
  }
  return sanitizeText(text);
}

export function detectLMS() {
  const html = document.documentElement.innerHTML.toLowerCase();
  if (html.includes('moodle') || document.querySelector('.que, .qtext')) {
    if (document.querySelector('.que')) return 'moodle';
  }
  if (html.includes('canvas-lms') || html.includes('instructure.com') || document.querySelector('body.canvas')) {
    return 'canvas';
  }
  if (html.includes('blackboard') || document.querySelector('[class*="blackboard"]')) return 'blackboard';
  if (window.location.hostname.includes('docs.google.com') || html.includes('freebird')) return 'googleforms';
  return 'custom';
}

export function safeJsonParse(str) {
  if (!str) return null;
  try {
    // Remove markdown fences if present
    let cleaned = str.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
      // If still starts with ```
      cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
    }
    // Find JSON object boundaries
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleaned);
  } catch (e) {
    Logger.error('JSON parse failed', e, str.slice(0, 200));
    return null;
  }
}

export function validateAIResponse(response) {
  if (!response || typeof response !== 'object') return false;
  if (!Array.isArray(response.answers)) return false;
  for (const ans of response.answers) {
    if (typeof ans.id !== 'number') return false;
    if (!Array.isArray(ans.correct)) return false;
    if (ans.correct.some(c => typeof c !== 'number')) return false;
  }
  return true;
}
