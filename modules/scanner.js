/**
 * MCQ Scanner - Intelligent detection for multiple LMS platforms
 * Supports Moodle, Canvas, Blackboard, Google Forms, Custom
 */
import { isVisible, findLabelForInput, extractTextFromElement, getClosestQuestionContainer, sanitizeText, Logger, hashString, detectLMS } from './utils.js';

export class MCQScanner {
  constructor() {
    this.lastScanHash = null;
    this.scanCache = new Map();
  }

  /**
   * Main scan method
   * @returns {Array} Questions array
   */
  scan() {
    Logger.info('Starting MCQ scan, LMS:', detectLMS());
    const questions = [];
    let questionId = 0;

    // Strategy 1: Radio groups (traditional)
    const radioQuestions = this.scanRadioGroups();
    for (const q of radioQuestions) {
      q.id = questionId++;
      questions.push(q);
    }

    // Strategy 2: Checkbox groups
    const checkboxQuestions = this.scanCheckboxGroups();
    for (const q of checkboxQuestions) {
      if (this.isSimilarQuestionExists(q, questions)) continue;
      q.id = questionId++;
      questions.push(q);
    }

    // Strategy 3: ARIA roles (Google Forms & modern LMS)
    const ariaQuestions = this.scanAriaRoles();
    for (const q of ariaQuestions) {
      if (this.isSimilarQuestionExists(q, questions)) continue;
      q.id = questionId++;
      questions.push(q);
    }

    // Strategy 4: Google Forms specific
    const gformQuestions = this.scanGoogleForms();
    for (const q of gformQuestions) {
      if (this.isSimilarQuestionExists(q, questions)) continue;
      q.id = questionId++;
      questions.push(q);
    }

    // Filter invisible, empty
    const filtered = questions.filter(q => 
      q.question && q.question.trim().length > 5 && 
      q.options && q.options.length >= 2 &&
      q.options.some(opt => opt.text && opt.text.trim().length > 0)
    );

    Logger.info(`Scanned ${filtered.length} questions`);
    return filtered;
  }

  isSimilarQuestionExists(newQ, existing) {
    const newHash = hashString(newQ.question.slice(0, 100));
    return existing.some(eq => hashString(eq.question.slice(0, 100)) === newHash);
  }

  scanRadioGroups() {
    const inputs = [...document.querySelectorAll('input[type="radio"]')].filter(isVisible);
    const groups = new Map(); // name -> inputs

    for (const input of inputs) {
      const name = input.name || input.getAttribute('data-name') || `__no_name_${Math.random()}`;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(input);
    }

    const questions = [];
    for (const [name, groupInputs] of groups) {
      if (groupInputs.length < 2) continue; // Need at least 2 options
      const container = getClosestQuestionContainer(groupInputs[0]);
      if (!container) continue;

      const questionText = this.extractQuestionText(container, groupInputs);
      if (!questionText) continue;

      const options = groupInputs.map((input, idx) => {
        const labelEl = findLabelForInput(input);
        let text = '';
        if (labelEl) {
          text = extractTextFromElement(labelEl);
          // Remove if label contains input itself, get remaining
          if (labelEl.contains(input)) {
            text = labelEl.innerText.replace(input.value || '', '').trim() || extractTextFromElement(labelEl);
          }
        }
        // Fallback: aria-label, value, sibling text
        if (!text) {
          text = input.getAttribute('aria-label') || input.value || input.nextSibling?.textContent || '';
          text = sanitizeText(text);
        }
        // Google Forms style may have text in sibling div
        if (!text || text.length < 1) {
          const parent = input.parentElement;
          if (parent) {
            text = extractTextFromElement(parent);
          }
        }
        return {
          index: idx,
          text: text || `Option ${idx + 1}`,
          element: input,
          labelElement: labelEl,
          raw: input
        };
      });

      if (options.length >= 2) {
        questions.push({
          element: container,
          question: questionText,
          options,
          type: 'single',
          inputName: name,
          meta: { source: 'radio' }
        });
      }
    }
    return questions;
  }

  scanCheckboxGroups() {
    const inputs = [...document.querySelectorAll('input[type="checkbox"]')].filter(isVisible);
    // Group by name or by container proximity
    const containerMap = new Map(); // container element -> inputs
    for (const input of inputs) {
      // Skip if it looks like a generic UI checkbox not a question
      if (this.isUIIgnore(input)) continue;
      const container = getClosestQuestionContainer(input);
      if (!container) continue;
      const key = container;
      if (!containerMap.has(key)) containerMap.set(key, []);
      containerMap.get(key).push(input);
    }

    const questions = [];
    for (const [container, groupInputs] of containerMap) {
      if (groupInputs.length < 2) continue;
      const questionText = this.extractQuestionText(container, groupInputs);
      if (!questionText) continue;

      const options = groupInputs.map((input, idx) => {
        const labelEl = findLabelForInput(input);
        let text = labelEl ? extractTextFromElement(labelEl) : '';
        if (!text) text = input.getAttribute('aria-label') || input.value || `Option ${idx+1}`;
        return {
          index: idx,
          text: sanitizeText(text),
          element: input,
          labelElement: labelEl,
          raw: input
        };
      });

      if (options.length >= 2) {
        questions.push({
          element: container,
          question: questionText,
          options,
          type: 'multi',
          inputName: groupInputs[0].name || `checkbox_${hashString(questionText)}`,
          meta: { source: 'checkbox' }
        });
      }
    }
    return questions;
  }

  scanAriaRoles() {
    const ariaRadios = [...document.querySelectorAll('[role="radio"]')].filter(isVisible);
    const ariaCheckboxes = [...document.querySelectorAll('[role="checkbox"]')].filter(isVisible);

    const groups = new Map(); // container -> elements
    [...ariaRadios, ...ariaCheckboxes].forEach(el => {
      if (this.isUIIgnore(el)) return;
      const container = getClosestQuestionContainer(el);
      if (!container) return;
      if (!groups.has(container)) groups.set(container, []);
      groups.get(container).push(el);
    });

    const questions = [];
    for (const [container, elements] of groups) {
      if (elements.length < 2) continue;
      const type = elements[0].getAttribute('role') === 'checkbox' ? 'multi' : 'single';
      const questionText = this.extractQuestionText(container, elements);
      if (!questionText) continue;

      const options = elements.map((el, idx) => {
        let text = el.getAttribute('aria-label') || el.getAttribute('data-value') || extractTextFromElement(el) || el.textContent || '';
        // For ARIA, often text is in sibling or descendant
        if (!text || text.trim().length < 2) {
          const label = el.closest('label') || el.parentElement;
          if (label) text = extractTextFromElement(label);
        }
        return {
          index: idx,
          text: sanitizeText(text) || `Option ${idx+1}`,
          element: el,
          labelElement: el,
          raw: el
        };
      });

      questions.push({
        element: container,
        question: questionText,
        options,
        type,
        inputName: `aria_${hashString(questionText)}`,
        meta: { source: 'aria' }
      });
    }
    return questions;
  }

  scanGoogleForms() {
    const questions = [];
    // Google Forms root
    const roots = document.querySelectorAll('.freebirdFormviewerComponentsQuestionBaseRoot, [role="listitem"]');
    roots.forEach((root, rootIdx) => {
      try {
        // Question text
        const qTitleEl = root.querySelector('.freebirdFormviewerComponentsQuestionBaseTitle, .freebirdFormviewerComponentsQuestionTextRoot, [class*="QuestionTitle"]');
        let questionText = qTitleEl ? extractTextFromElement(qTitleEl) : '';
        if (!questionText) {
          // Fallback: first text-heavy child
          const candidates = root.querySelectorAll('div[role="heading"], div[jsname]');
          for (const c of candidates) {
            const t = extractTextFromElement(c);
            if (t.length > 10) { questionText = t; break; }
          }
        }
        if (!questionText) return;

        // Options
        const optionEls = root.querySelectorAll('.freebirdFormviewerComponentsQuestionRadioChoice, .freebirdFormviewerComponentsQuestionCheckboxChoice, [role="radio"], [role="checkbox"], .docssharedWizToggleLabeledPrimary');
        if (optionEls.length < 2) return;

        // Determine type
        const isCheckbox = root.querySelectorAll('.freebirdFormviewerComponentsQuestionCheckboxChoice, [role="checkbox"]').length > 0;
        const type = isCheckbox ? 'multi' : 'single';

        const options = [...optionEls].map((el, idx) => {
          // Filter out duplicate containers
          const textEl = el.querySelector('.freebirdFormviewerComponentsQuestionRadioLabel, .freebirdFormviewerComponentsQuestionCheckboxLabel, [class*="Label"]') || el;
          let text = extractTextFromElement(textEl) || el.getAttribute('aria-label') || `Option ${idx+1}`;
          // The actual clickable element
          const clickEl = el.querySelector('[role="radio"], [role="checkbox"]') || el;
          return {
            index: idx,
            text: sanitizeText(text),
            element: clickEl,
            labelElement: el,
            raw: el
          };
        });

        // Deduplicate options by text
        const uniqueOptions = [];
        const seen = new Set();
        for (const opt of options) {
          if (!seen.has(opt.text)) {
            seen.add(opt.text);
            uniqueOptions.push({ ...opt, index: uniqueOptions.length });
          }
        }

        if (uniqueOptions.length >= 2 && !this.isUIIgnoreQuestion(questionText)) {
          questions.push({
            element: root,
            question: questionText,
            options: uniqueOptions,
            type,
            inputName: `gform_${rootIdx}_${hashString(questionText)}`,
            meta: { source: 'googleforms' }
          });
        }
      } catch (e) {
        Logger.warn('Google Forms parse error', e);
      }
    });
    return questions;
  }

  extractQuestionText(container, inputs) {
    if (!container) return '';

    // Try specific selectors first
    const selectors = [
      '.qtext',
      '.question_text',
      '.question-text',
      '.prompt',
      '.freebirdFormviewerComponentsQuestionBaseTitle',
      'legend',
      '.questionText',
      '[class*="QuestionText"]',
      'h1', 'h2', 'h3', 'h4', 'h5',
      'p',
      '.stem',
      '[class*="stem"]'
    ];

    for (const sel of selectors) {
      const el = container.querySelector(sel);
      if (el) {
        const text = extractTextFromElement(el);
        if (text.length > 10 && text.length < 2000) {
          // Ensure not an option text
          const inputTexts = inputs.map(i => {
            const l = findLabelForInput(i) || i;
            return extractTextFromElement(l).toLowerCase();
          });
          if (!inputTexts.includes(text.toLowerCase())) {
            return text;
          }
        }
      }
    }

    // Fallback: get all text nodes in container that are not options
    try {
      const clone = container.cloneNode(true);
      // Remove option elements to avoid pollution
      inputs.forEach(input => {
        const label = findLabelForInput(input) || input;
        if (label && clone.contains(label)) {
          // Don't remove for text extraction, just avoid; instead clone approach
        }
        // Remove inputs from clone
        const inputsInClone = clone.querySelectorAll('input, [role="radio"], [role="checkbox"]');
        inputsInClone.forEach(el => {
          const parentLabel = el.closest('label');
          if (parentLabel) parentLabel.remove();
          else el.remove();
        });
      });

      // Also remove answer container classes
      const answerContainers = clone.querySelectorAll('.answer, .answers');
      answerContainers.forEach(ac => {
        // keep but text will be removed earlier? we already removed inputs
      });

      let text = extractTextFromElement(clone);
      // Clean up lines that look like options (short, A) B) etc)
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 10);
      if (lines.length > 0) {
        // Take first substantial line as question
        text = lines[0];
        // If question is too short, join first two
        if (text.length < 15 && lines.length > 1) text = lines.slice(0, 2).join(' ');
      }
      return sanitizeText(text).slice(0, 2000);
    } catch (e) {
      return '';
    }
  }

  isUIIgnore(el) {
    if (!el) return true;
    const ignoreClasses = ['lms-ai-solver', 'toast', 'popup', 'setup-dialog', 'floating-button'];
    const className = el.className || '';
    if (typeof className === 'string') {
      for (const ig of ignoreClasses) {
        if (className.toLowerCase().includes(ig)) return true;
      }
    }
    // Ignore hidden, disabled with no question
    const id = el.id || '';
    if (id.toLowerCase().includes('lms-ai')) return true;
    return false;
  }

  isUIIgnoreQuestion(text) {
    if (!text) return true;
    const low = text.toLowerCase();
    if (low.includes('lms ai solver')) return true;
    if (low.trim().length < 5) return true;
    return false;
  }
}

export const mcqScanner = new MCQScanner();
