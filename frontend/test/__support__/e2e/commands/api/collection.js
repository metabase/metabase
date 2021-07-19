Cypress.Commands.add(
  "createCollection",
  ({
    name,
    description = null,
    parent_id = null,
    color = "#509EE3",
    authority_level = null,
  } = {}) => {
    cy.log(`Create a collection: ${name}`);
    return cy.request("POST", "/api/collection", {
      name,
      description,
      parent_id,
      color,
      authority_level,
    });
  },
);
