import { restore, visitQuestion } from "__support__/e2e/cypress";

describe("scenarios > collections > timelines", () => {
  beforeEach(() => {
    restore();
  });

  describe("as admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      cy.intercept("GET", "/api/collection/root").as("collections");
      cy.intercept("POST", "/api/timeline-event").as("timelineEvent");
      cy.intercept("PUT", "/api/timeline-event/**").as("putTimelineEvent");
    });

    it("should create the first event and timeline", () => {
      visitQuestion(3);
      cy.wait("@collections");
      cy.findByTextEnsureVisible("Visualization");

      cy.findByLabelText("calendar icon").click();
      cy.findByTextEnsureVisible("Add an event").click();

      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Date").type("10/20/2018");
      cy.button("Create").click();
      cy.wait("@timelineEvent");

      cy.findByTextEnsureVisible("Our analytics events");
      cy.findByText("RC1");
    });

    it("should create an event within the default timeline", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2018-10-20T00:00:00Z" }],
      });

      visitQuestion(3);
      cy.wait("@collections");
      cy.findByTextEnsureVisible("Visualization");

      cy.findByLabelText("calendar icon").click();
      cy.findByTextEnsureVisible("Add an event").click();

      cy.findByLabelText("Event name").type("RC2");
      cy.findByLabelText("Date").type("10/30/2018");
      cy.button("Create").click();
      cy.wait("@timelineEvent");

      cy.findByTextEnsureVisible("Releases");
      cy.findByText("RC1");
      cy.findByText("RC2");
    });

    it("should edit an event", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2018-10-20T00:00:00Z" }],
      });

      visitQuestion(3);
      cy.wait("@collections");
      cy.findByTextEnsureVisible("Visualization");

      cy.findByLabelText("calendar icon").click();
      cy.findByText("Releases");
      cy.findByLabelText("ellipsis icon").click();
      cy.findByTextEnsureVisible("Edit event").click();

      cy.findByLabelText("Event name")
        .clear()
        .type("RC2");
      cy.findByText("Update").click();
      cy.wait("@putTimelineEvent");

      cy.findByTextEnsureVisible("Releases");
      cy.findByText("RC2");
    });

    it("should archive and unarchive and event", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2018-10-20T00:00:00Z" }],
      });

      visitQuestion(3);
      cy.wait("@collections");
      cy.findByTextEnsureVisible("Visualization");

      cy.findByLabelText("calendar icon").click();
      cy.findByText("Releases");
      cy.findByLabelText("ellipsis icon").click();
      cy.findByTextEnsureVisible("Archive event").click();
      cy.wait("@putTimelineEvent");
      cy.findByText("RC1").should("not.exist");

      cy.findByText("Undo").click();
      cy.wait("@putTimelineEvent");
      cy.findByText("RC1");
    });

    it("should support markdown in event description", () => {
      cy.createTimelineWithEvents({
        timeline: {
          name: "Releases",
        },
        events: [
          {
            name: "RC1",
            description: "[Release notes](https://metabase.test)",
          },
        ],
      });

      visitQuestion(3);
      cy.findByLabelText("calendar icon").click();

      cy.findByText("Releases").should("be.visible");
      cy.findByText("Release notes").should("be.visible");
    });
  });

  describe("as readonly user", () => {
    it("should not allow creating default timelines", () => {
      cy.signIn("readonly");
      visitQuestion(3);
      cy.findByTextEnsureVisible("Created At");

      cy.findByLabelText("calendar icon").click();
      cy.findByTextEnsureVisible(/Events in Metabase/);
      cy.findByText("Add an event").should("not.exist");
    });

    it("should not allow creating or editing events", () => {
      cy.signInAsAdmin();
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }],
      });
      cy.signOut();
      cy.signIn("readonly");
      visitQuestion(3);
      cy.findByTextEnsureVisible("Created At");

      cy.findByLabelText("calendar icon").click();
      cy.findByTextEnsureVisible("Releases");
      cy.findByText("Add an event").should("not.exist");
      cy.findByLabelText("ellipsis icon").should("not.exist");
    });
  });
});
