export function adhocQuestionHash(question) {
  if (question.display) {
    // without "locking" the display, the QB will run its picking logic and override the setting
    question = Object.assign({}, question, { displayIsLocked: true });
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(question))));
}

export function visitQuestionAdhoc(question) {
  const {
    display,
    dataset_query: { type },
  } = question;

  const isPivotEndpoint = display === "pivot" && type === "query";

  const url = isPivotEndpoint ? "/api/dataset/pivot" : "/api/dataset";
  const alias = isPivotEndpoint ? "pivotDataset" : "dataset";

  cy.intercept(url).as(alias);

  cy.visit("/question#" + adhocQuestionHash(question));

  cy.wait("@" + alias);
}
