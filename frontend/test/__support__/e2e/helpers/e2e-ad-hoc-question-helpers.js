import { runNativeQuery } from "__support__/e2e/helpers/e2e-misc-helpers";

export function adhocQuestionHash(question) {
  if (question.display) {
    // without "locking" the display, the QB will run its picking logic and override the setting
    question = Object.assign({}, question, { displayIsLocked: true });
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(question))));
}

export function visitQuestionAdhoc(question, { autorun = true } = {}) {
  cy.visit("/question#" + adhocQuestionHash(question));
  runQueryIfNeeded(question, autorun);
}

function runQueryIfNeeded(question, autorun) {
  const {
    dataset_query: { type },
  } = question;

  if (type === "native" && autorun) {
    runNativeQuery({ wait: false });
  }
}
