Cypress.Commands.add(
  "createTimeline",
  ({
    name = "Timeline",
    description,
    icon = "star",
    collection_id,
    default: is_default = false,
    archived = false,
  } = {}) => {
    return cy.request("POST", "/api/timeline", {
      name,
      description,
      icon,
      collection_id,
      default: is_default,
      archived,
    });
  },
);

Cypress.Commands.add(
  "createTimelineEvent",
  ({
    name = "Event",
    description,
    icon = "star",
    timestamp = "2020-01-01T00:00:00Z",
    time_matters = false,
    timezone = "UTC",
    timeline_id,
    archived = false,
  }) => {
    return cy.request("POST", "/api/timeline-event", {
      name,
      description,
      icon,
      timestamp,
      time_matters,
      timezone,
      timeline_id,
      archived,
    });
  },
);
