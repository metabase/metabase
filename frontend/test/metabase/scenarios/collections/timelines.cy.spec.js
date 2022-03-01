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
      cy.visit("/collection/root");

      cy.findByLabelText("calendar icon").click();

      cy.findByText("Add an event").click();
      cy.findByLabelText("Event name").type("v1.0");
      cy.findByLabelText("Date").type("10/20/2020");
      cy.button("Create").click();

      cy.findByText("v1.0");
      cy.findByText("October 20, 2020");
      cy.findByLabelText("star icon");

      cy.findByText("Add an event").click();
      cy.findByLabelText("Event name").type("v2.0");
      cy.findByLabelText("Date").type("5/12/2021");
      cy.findByText("Star").click();
      cy.findByText("Balloons").click();
      cy.button("Create").click();

      cy.findByText("v2.0");
      cy.findByText("May 12, 2021");
      cy.findByLabelText("balloons icon");
    });

    it("should edit an event", () => {
      cy.createTimelineWithEvents({ events: [{ name: "v1.0" }] });
      cy.visit("/collection/root/timelines");

      openEventMenu("v1.0");
      cy.findByText("Edit event").click();
      cy.findByLabelText("Event name")
        .clear()
        .type("v2.0");
      cy.button("Update").click();

      cy.findByText("v2.0");
    });
  });
});

const openEventMenu = name => {
  return cy
    .findByText(name)
    .parent()
    .parent()
    .within(() => cy.findByLabelText("ellipsis icon").click());
};
