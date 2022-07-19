import { cypressWaitAll } from "__support__/e2e/helpers";

Cypress.Commands.add("createTimelineWithEvents", ({ timeline, events }) => {
  return cy.createTimeline(timeline).then(({ body: timeline }) => {
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
