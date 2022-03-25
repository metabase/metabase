import {
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  restore,
} from "__support__/e2e/cypress";

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

    it("should search for events", () => {
      cy.createTimelineWithEvents({
        events: [
          { name: "RC1" },
          { name: "RC2" },
          { name: "v1.0" },
          { name: "v1.1" },
        ],
      });

      cy.visit("/collection/root/timelines");

      cy.findByPlaceholderText("Search for an event").type("V1");
      cy.findByText("v1.0");
      cy.findByText("v1.1");
      cy.findByText("RC1").should("not.exist");
      cy.findByText("RC2").should("not.exist");
    });

    it("should create an event with date", () => {
      cy.visit("/collection/root");

      cy.findByLabelText("calendar icon").click();
      cy.findByText("Add an event").click();

      cy.findByLabelText("Event name").type("RC1");
      cy.findByRole("button", { name: "calendar icon" }).click();
      cy.findByText("15").click();
      cy.findByText("Done").click();
      cy.findByText("Create").click();

      cy.findByText("Our analytics events");
      cy.findByText("RC1");
      cy.findByText("AM").should("not.exist");
    });

    it("should create an event with date and time", () => {
      cy.visit("/collection/root");

      cy.findByLabelText("calendar icon").click();
      cy.findByText("Add an event").click();

      cy.findByLabelText("Event name").type("RC1");
      cy.findByRole("button", { name: "calendar icon" }).click();
      cy.findByText("15").click();
      cy.findByText("Add time").click();
      cy.findByLabelText("Hours")
        .clear()
        .type("10");
      cy.findByLabelText("Minutes")
        .clear()
        .type("20");
      cy.findByText("Done").click();
      cy.findByText("Create").click();

      cy.findByText("Our analytics events");
      cy.findByText("RC1");
      cy.findByText(/10:20 AM/);
    });

    it("should edit an event", () => {
      cy.createTimelineWithEvents({ events: [{ name: "RC1" }] });
      cy.visit("/collection/root/timelines");

      openMenu("RC1");
      cy.findByText("Edit event").click();
      cy.findByLabelText("Event name")
        .clear()
        .type("RC2");
      cy.button("Update").click();

      cy.findByText("RC2");
    });

    it("should archive an event when editing this event", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }, { name: "RC2" }],
      });

      cy.visit("/collection/root/timelines");

      openMenu("RC1");
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

      openMenu("RC1");
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
      openMenu("Releases");
      cy.findByText("View archived events").click();

      cy.findByText("Archived events");
      openMenu("RC1");
      cy.findByText("Unarchive event").click();
      cy.findByText("No events found");

      cy.findByText("Undo").click();
      cy.findByText("RC1");
    });

    it("should delete an event", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", archived: true }],
      });

      cy.visit("/collection/root/timelines");
      openMenu("Releases");
      cy.findByText("View archived events").click();

      cy.findByText("Archived events");
      openMenu("RC1");
      cy.findByText("Delete event").click();
      cy.findByText("Delete").click();
      cy.findByText("No events found");
    });

    it("should create an additional timeline", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }],
      });

      cy.visit("/collection/root/timelines");
      openMenu("Releases");
      cy.findByText("New timeline").click();
      cy.findByLabelText("Timeline name").type("Launches");
      cy.findByText("Create").click();

      cy.findByText("Launches");
      cy.findByText("Add an event");
    });

    it("should edit a timeline", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }],
      });

      cy.visit("/collection/root/timelines");
      openMenu("Releases");
      cy.findByText("Edit timeline details").click();
      cy.findByLabelText("Timeline name")
        .clear()
        .type("Launches");
      cy.findByText("Update").click();

      cy.findByText("Launches");
    });

    it("should archive and unarchive a timeline", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }, { name: "RC2" }],
      });

      cy.visit("/collection/root/timelines");
      openMenu("Releases");
      cy.findByText("Edit timeline details").click();
      cy.findByText("Archive timeline and all events").click();
      cy.findByText("Our analytics events");
      cy.findByText("Add an event");

      cy.findByText("Undo").click();
      cy.findByText("Releases");
      cy.findByText("RC1");
      cy.findByText("RC2");
    });

    it("should support markdown in timeline description", () => {
      cy.createTimeline({
        name: "Releases",
        description: "[Release notes](https://metabase.test)",
      });

      cy.createTimeline({
        name: "Holidays",
        description: "[Holiday list](https://metabase.test)",
      });

      cy.visit("/collection/root/timelines");
      cy.findByText("Release notes").should("be.visible");
      cy.findByText("Holiday list").should("be.visible");
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

      cy.visit("/collection/root/timelines");
      cy.findByText("Release notes").should("be.visible");
    });
  });

  describe("as readonly user", () => {
    it("should not allow creating new timelines in collections", () => {
      cy.signIn("readonly");
      cy.visit("/collection/root");

      cy.findByLabelText("calendar icon").click();
      cy.findByText("Our analytics events");
      cy.findByText("Add an event").should("not.exist");
    });

    it("should not allow creating new events in existing timelines", () => {
      cy.signInAsAdmin();
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }],
      });
      cy.signOut();

      cy.signIn("readonly");
      cy.visit("/collection/root");
      cy.findByLabelText("calendar icon").click();
      cy.findByText("Releases");
      cy.findByText("Add an event").should("not.exist");
    });
  });
});

describeWithSnowplow("scenarios > collections > timelines", () => {
  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
    enableTracking();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should send snowplow events when creating a timeline event", () => {
    // 1 - new_instance_created
    // 2 - pageview
    cy.visit("/collection/root");

    // 3 - pageview
    cy.findByLabelText("calendar icon").click();

    cy.findByText("Add an event").click();
    cy.findByLabelText("Event name").type("Event");
    cy.findByLabelText("Date").type("10/20/2020");

    // 4 - new_event_created
    // 5 - pageview
    cy.button("Create").click();

    expectGoodSnowplowEvents(5);
  });
});

const openMenu = name => {
  return cy
    .findByText(name)
    .parent()
    .parent()
    .within(() => cy.findByLabelText("ellipsis icon").click());
};
