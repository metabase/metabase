Cypress.Commands.add("createQuestion", (questionDetails, customOptions) => {
  const { name, query } = questionDetails;

  throwIfNotPresent(query);

  logAction("Create a QB question", name);

  question("query", questionDetails, customOptions);
});

Cypress.Commands.add(
  "createNativeQuestion",
  (questionDetails, customOptions) => {
    const { name, native } = questionDetails;

    throwIfNotPresent(native);

    logAction("Create a native question", name);

    question("native", questionDetails, customOptions);
  },
);

function question(
  type,
  {
    name = "test question",
    native,
    query,
    database = 1,
    display = "table",
    visualization_settings = {},
    collection_id,
    collection_position,
  } = {},
  { loadMetadata = false, visitQuestion = false } = {},
) {
  cy.request("POST", "/api/card", {
    name,
    dataset_query: {
      type,
      [type]: type === "native" ? native : query,
      database,
    },
    display,
    visualization_settings,
    collection_id,
    collection_position,
  }).then(({ body }) => {
    if (loadMetadata || visitQuestion) {
      cy.intercept("POST", `/api/card/${body.id}/query`).as("cardQuery");
      cy.visit(`/question/${body.id}`);

      // Wait for `result_metadata` to load
      cy.wait("@cardQuery");
    }
  });
}

function throwIfNotPresent(param) {
  if (!param) {
    throw new Error(`Wrong key! Expected "query" or "native".`);
  }
}

function logAction(string, name) {
  const message = name ? `${string}: ${name}` : string;

  cy.log(message);
}
