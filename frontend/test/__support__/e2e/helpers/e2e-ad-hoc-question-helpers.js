export function adhocQuestionHash(question) {
  if (question.display) {
    // without "locking" the display, the QB will run its picking logic and override the setting
    question = Object.assign({}, question, { displayIsLocked: true });
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(question))));
}

export function visitQuestionAdhoc(question) {
  cy.intercept("POST", "/api/dataset").as("dataset");

  cy.visit("/question#" + adhocQuestionHash(question));
  cy.wait("@dataset");
}
