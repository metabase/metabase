import type {
  CreateTimelineEventRequest,
  TimelineEvent,
} from "metabase-types/api";

export const createTimelineEvent = ({
  name = "Event",
  icon = "star",
  timestamp = "2020-01-01T00:00:00Z",
  time_matters = false,
  timezone = "UTC",
  archived = false,
  ...params
}: CreateTimelineEventRequest): Cypress.Chainable<
  Cypress.Response<TimelineEvent>
> => {
  return cy.request("POST", "/api/timeline-event", {
    ...params,
    name,
    icon,
    timestamp,
    time_matters,
    timezone,
    archived,
  });
};
