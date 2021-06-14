Cypress.Commands.add(
  "createQuestion",
  ({
    name = "card",
    query = {},
    display = "table",
    database = 1,
    visualization_settings = {},
  } = {}) => {
    cy.log(`Create a question: ${name}`);
    cy.request("POST", "/api/card", {
      name,
      dataset_query: {
        type: "query",
        query,
        database,
      },
      display,
      visualization_settings,
    });
  },
);

Cypress.Commands.add(
  "createNativeQuestion",
  ({
    name = "native",
    native = {},
    display = "table",
    database = 1,
    visualization_settings = {},
  } = {}) => {
    cy.log(`Create a native question: ${name}`);
    cy.request("POST", "/api/card", {
      name,
      dataset_query: {
        type: "native",
        native,
        database,
      },
      display,
      visualization_settings,
    });
  },
);
