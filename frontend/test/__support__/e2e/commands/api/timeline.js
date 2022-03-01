Cypress.Commands.add(
  "createTimeline",
  ({ name = "Timeline", description, icon = "star", collection_id } = {}) => {
    return cy.request("POST", "/api/timeline", {
      name,
      description,
      icon,
      collection_id,
    });
  },
);

Cypress.Commands.add(
  "createTimelineEvent",
  ({
    name = "Event",
    timestamp = "2020-01-01T00:00:00Z",
    description,
    icon = "star",
    timezone = "UTC",
    timeline_id,
  }) => {
    return cy.request("POST", "/api/timeline", {
      name,
      timestamp,
      description,
      icon,
      timezone,
      timeline_id,
    });
  },
);
