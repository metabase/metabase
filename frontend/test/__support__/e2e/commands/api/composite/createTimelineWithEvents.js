import { cypressWaitAll } from "__support__/e2e/cypress";

Cypress.Commands.add("createTimelineWithEvents", ({ events }) => {
  return cy.createTimeline().then(({ body: timeline }) => {
    return cypressWaitAll(
      events.map(query =>
        cy.createTimelineEvent({ ...query, timeline_id: timeline.id }),
      ),
    ).then(events => {
      return {
        timeline,
        events,
      };
    });
  });
});
