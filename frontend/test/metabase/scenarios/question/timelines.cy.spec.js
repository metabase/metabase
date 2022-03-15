import { restore } from "__support__/e2e/cypress";

describe("scenarios > collections > timelines", () => {
  beforeEach(() => {
    restore();
  });

  describe("as admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("should create the first event and timeline", () => {
      cy.visit("/question/3");
      cy.findByLabelText("calendar icon").click();
      cy.button("Add an event").click();

      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Date").type("10/20/2018");
      cy.button("Create").click();

      cy.findByText("Our analytics events").click();
      cy.findByText("RC1");
    });

    it("should create an event within the default timeline", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2018-10-20T00:00:00Z" }],
      });

      cy.visit("/question/3");
      cy.findByLabelText("calendar icon").click();
      cy.button("Add an event").click();

      cy.findByLabelText("Event name").type("RC2");
      cy.findByLabelText("Date").type("10/30/2018");
      cy.button("Create").click();

      cy.findByText("Releases").click();
      cy.findByText("RC1");
      cy.findByText("RC2");
    });
  });
});
