import type { ModerationReview } from "metabase-types/api";

export const createModerationReview = ({
  status,
  moderated_item_type,
  moderated_item_id,
}: {
  status: "verified" | null;
  moderated_item_type: "card";
  moderated_item_id: number;
}): Cypress.Chainable<Cypress.Response<ModerationReview>> => {
  cy.log(
    `Create a moderation review, status: ${status}, item type: ${moderated_item_type}, item id: ${moderated_item_id}`,
  );

  return cy.request<ModerationReview>("POST", "/api/moderation-review", {
    status,
    moderated_item_id,
    moderated_item_type,
  });
};
