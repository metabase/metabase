Cypress.Commands.add(
  "createModerationReview",
  ({ status, moderated_item_type, moderated_item_id }) => {
    cy.log(
      `Create a moderation review, status: ${status}, item type: ${moderated_item_type}, item id: ${moderated_item_id}`,
    );
    cy.request("POST", "/api/moderation-review", {
      status,
      moderated_item_id,
      moderated_item_type,
    });
  },
);
