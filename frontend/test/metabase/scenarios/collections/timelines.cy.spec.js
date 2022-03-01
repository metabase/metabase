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
      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Date").type("10/20/2020");
      cy.button("Create").click();

      cy.findByText("RC1");
      cy.findByText("October 20, 2020");
      cy.findByLabelText("star icon");

      cy.findByText("Add an event").click();
      cy.findByLabelText("Event name").type("RC2");
      cy.findByLabelText("Date").type("5/12/2021");
      cy.findByText("Star").click();
      cy.findByText("Balloons").click();
      cy.button("Create").click();

      cy.findByText("RC2");
      cy.findByText("May 12, 2021");
      cy.findByLabelText("balloons icon");
    });

    it("should edit an event", () => {
      cy.createTimelineWithEvents({ events: [{ name: "RC1" }] });
      cy.visit("/collection/root/timelines");

      openEventMenu("RC1");
      cy.findByText("Edit event").click();
      cy.findByLabelText("Event name").type("{backspace}2");
      cy.button("Update").click();

      cy.findByText("RC2");
    });

    it("should archive an event when editing this event", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }, { name: "RC2" }],
      });

      cy.visit("/collection/root/timelines");

      openEventMenu("RC1");
      cy.findByText("Edit event").click();
      cy.findByText("Archive event").click();

      cy.findByText("Releases");
      cy.findByText("RC1").should("not.exist");
    });

    it("should archive an event from the timeline and undo", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }, { name: "RC2" }],
      });

      cy.visit("/collection/root/timelines");

      openEventMenu("RC1");
      cy.findByText("Archive event").click();
      cy.findByText("RC1").should("not.exist");
      cy.findByText("Undo").click();
      cy.findByText("RC1");
    });

    it("should unarchive an event from the archive and undo", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", archived: true }],
      });

      cy.visit("/collection/root/timelines");
      openTimelineMenu("Releases");
      cy.findByText("View archived events").click();

      cy.findByText("Archived events");
      openEventMenu("RC1");
      cy.findByText("Unarchive event").click();
      cy.findByText("No events found");

      cy.findByText("Undo").click();
      cy.findByText("RC1");
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

const openTimelineMenu = name => {
  return cy
    .findByText(name)
    .parent()
    .within(() => cy.findByLabelText("ellipsis icon").click());
};
