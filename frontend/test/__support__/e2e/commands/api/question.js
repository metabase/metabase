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

/**
 *
 * @param {("query"|"native")} type
 *
 * @param {object} questionDetails
 * @param {string} [questionDetails.name="test question"]
 * @param {object} questionDetails.native
 * @param {object} questionDetails.query
 * @param {number} [questionDetails.database=1]
 * @param {string} [questionDetails.display="table"]
 * @param {object} [questionDetails.visualization_settings={}]
 * @param {number} [questionDetails.collection_id] - Parent collection in which to store this question.
 * @param {number} [questionDetails.collection_position] - used on the frontend to determine whether the question is pinned or not.
 *
 * @param {object} customOptions
 * @param {boolean} customOptions.loadMetadata - Whether to visit the question in order to load its metadata.
 * @param {boolean} customOptions.visitQuestion - Whether to visit the question after the creation or not.
 */
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

/**
 *
 * @param {string} title - A title used to log the Cypress action/request that follows it.
 * @param {string} [questionName] - Optional question name.
 */
function logAction(title, questionName) {
  const fullTitle = `${title}: ${questionName}`;
  const message = questionName ? fullTitle : title;

  cy.log(message);
}
