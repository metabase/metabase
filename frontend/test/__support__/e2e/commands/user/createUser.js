import { USERS } from "__support__/e2e/cypress_data";

Cypress.Commands.add("createUserFromRawData", user => {
  return cy.request("POST", "/api/user", user).then(({ body }) => {
    // Dismiss `it's ok to play around` modal for the created user
    cy.request("PUT", `/api/user/${body.id}/qbnewb`, {});
  });
});

Cypress.Commands.add("createUser", user => {
  cy.log(`Create ${user} user`);
  cy.createUserFromRawData(USERS[user]);
});
