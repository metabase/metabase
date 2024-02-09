import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

Cypress.Commands.add("createQuestion", (questionDetails, customOptions) => {
  const { name, query } = questionDetails;

  throwIfNotPresent(query);

  logAction("Create a QB question", name);
  return question("query", questionDetails, customOptions);
});

Cypress.Commands.add("archiveQuestion", id => {
  cy.log(`Archiving a question with id: ${id}`);
  return cy.request("PUT", `/api/card/${id}`, {
    archived: true,
  });
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
 * @param {("query"|"native")} queryType
 *
 * @param {object} questionDetails
 * @param {string} [questionDetails.name="test question"]
 * @param {string} questionDetails.description
 * @param {("question"|"model")} questionDetails.type Entity type
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
  queryType,
  {
    name = "test question",
    description,
    type = "question",
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
  return cy
    .request("POST", "/api/card", {
      name,
      description,
      dataset_query: {
        type: queryType,
        [queryType]: queryType === "native" ? native : query,
        database,
      },
      display,
      parameters,
      visualization_settings,
      collection_id,
      collection_position,
    })
    .then(({ body }) => {
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

      if (type === "model" || enable_embedding) {
        cy.request("PUT", `/api/card/${body.id}`, {
          type,
          enable_embedding,
          embedding_params,
        });
      }

      if (loadMetadata || visitQuestion) {
        if (type === "model") {
          cy.intercept("POST", `/api/dataset`).as("dataset");
          cy.visit(`/model/${body.id}`);
          cy.wait("@dataset"); // Wait for `result_metadata` to load
        } else {
          // We need to use the wildcard because endpoint for pivot tables has the following format: `/api/card/pivot/${id}/query`
          cy.intercept("POST", `/api/card/**/${body.id}/query`).as(
            interceptAlias,
          );
          cy.visit(`/question/${body.id}`);
          cy.wait("@" + interceptAlias); // Wait for `result_metadata` to load
        }
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
