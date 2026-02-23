import type { Card, CreateCardRequest } from "metabase-types/api";

export type CardDetails = Partial<
  Pick<CreateCardRequest, "name" | "display" | "visualization_settings">
> &
  Omit<CreateCardRequest, "name" | "display" | "visualization_settings">;

const DEFAULT_CARD_DETAILS: Partial<CreateCardRequest> = {
  name: "Test card",
  display: "table",
  visualization_settings: {},
};

export function createCard(details: CardDetails): Cypress.Chainable<Card> {
  return cy
    .request("POST", "/api/card", { ...DEFAULT_CARD_DETAILS, ...details })
    .then(({ body }) => body);
}
