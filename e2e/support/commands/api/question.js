import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

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
 * @param {string} questionDetails.description
 * @param {boolean} questionDetails.dataset - Is this a Model or no? (model = dataset)
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
 * @param {boolean} customOptions.wrapId - Whether to wrap a question id, to make it available outside of this scope.
 * @param {string} customOptions.idAlias - Alias a question id in order to use it later with `cy.get("@" + alias).
 * @param {string} customOptions.interceptAlias - We need distinctive endpoint aliases for cases where we have multiple questions or nested questions.
 */
function question(
  type,
  {
    name = "test question",
    description,
    dataset = false,
    native,
    query,
    database = SAMPLE_DB_ID,
    display = "table",
    parameters,
    visualization_settings = {},
    collection_id,
    collection_position,
    embedding_params,
    enable_embedding = false,
  } = {},
  {
    loadMetadata = false,
    visitQuestion = false,
    wrapId = false,
    idAlias = "questionId",
    interceptAlias = "cardQuery",
  } = {},
) {
  cy.request("POST", "/api/card", {
    name,
    description,
    dataset_query: {
      type,
      [type]: type === "native" ? native : query,
      database,
    },
    display,
    parameters,
    visualization_settings,
    collection_id,
    collection_position,
  }).then(({ body }) => {
    /**
     * Optionally, if you need question's id later in the test, outside the scope of this function,
     * you can use it like this:
     *
     * `cy.get("@questionId").then(id=> {
     *   doSomethingWith(id);
     * })
     */
    if (wrapId) {
      cy.wrap(body.id).as(idAlias);
    }

    if (dataset || enable_embedding) {
      cy.request("PUT", `/api/card/${body.id}`, {
        dataset,
        enable_embedding,
        embedding_params,
      });
    }

    if (loadMetadata || visitQuestion) {
      dataset
        ? cy.intercept("POST", `/api/dataset`).as("dataset")
        : // We need to use the wildcard because endpoint for pivot tables has the following format: `/api/card/pivot/${id}/query`
          cy
            .intercept("POST", `/api/card/**/${body.id}/query`)
            .as(interceptAlias);

      const url = dataset ? `/model/${body.id}` : `/question/${body.id}`;
      cy.visit(url);

      // Wait for `result_metadata` to load
      dataset ? cy.wait("@dataset") : cy.wait("@" + interceptAlias);
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
