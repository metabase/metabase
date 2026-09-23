import type {
  CreateTimelineEventRequest,
  TimelineEvent,
} from "metabase-types/api";

/** Everything the API takes, with defaults filled in by this helper — a test only has to name the timeline. */
export type TimelineEventDetails = Partial<CreateTimelineEventRequest> &
  Pick<CreateTimelineEventRequest, "timeline_id">;

export const createTimelineEvent = ({
  name = "Event",
  icon = "star",
  timestamp = "2020-01-01T00:00:00Z",
  time_matters = false,
  timezone = "UTC",
  archived = false,
  ...params
}: TimelineEventDetails): Cypress.Chainable<
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
