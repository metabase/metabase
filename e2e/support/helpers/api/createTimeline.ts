import type { CreateTimelineRequest, Timeline } from "metabase-types/api";

export const createTimeline = ({
  name = "Timeline",
  icon = "star",
  default: isDefault = false,
  archived = false,
  ...params
}: CreateTimelineRequest): Cypress.Chainable<Cypress.Response<Timeline>> => {
  return cy.request("POST", "/api/timeline", {
    ...params,
    name,
    icon,
    default: isDefault,
    archived,
  });
};
