import { restore } from "__support__/e2e/cypress";

const EVENTS = [
  { name: "Event 1", timestamp: "2020-01-01", icon: "star" },
  { name: "Event 2", timestamp: "2020-03-01", icon: "mail" },
  { name: "Event 3", timestamp: "2020-02-01", icon: "balloons" },
];

describe("timelines", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display empty state", () => {
    cy.visit("/collection/root/timelines");

    cy.findByText("Our analytics events");
    cy.percySnapshot();
  });

  it("should display timeline events", () => {
    cy.createTimelineWithEvents({ events: EVENTS }).then(({ timeline }) => {
      cy.visit(`/collection/root/timelines/${timeline.id}`);

      cy.findByText("Timeline");
      cy.percySnapshot();
    });
  });
});
