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

      cy.findByText("RC1").should("be.visible");
      cy.findByText("October 20, 2020").should("be.visible");
      cy.findByLabelText("star icon").should("be.visible");

      cy.findByText("Add an event").click();
      cy.findByLabelText("Event name").type("RC2");
      cy.findByLabelText("Date").type("5/12/2021");
      cy.findByText("Star").click();
      cy.findByText("Balloons").click();
      cy.button("Create").click();

      cy.findByText("RC2").should("be.visible");
      cy.findByText("May 12, 2021").should("be.visible");
      cy.findByLabelText("balloons icon").should("be.visible");
    });

    it("should create an event in a personal collection", () => {
      cy.visit("/collection/root");
      cy.findByText("Your personal collection").click();
      cy.findByLabelText("calendar icon").click();

      cy.findByText("Add an event").click();
      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Date").type("10/20/2020");
      cy.button("Create").click();

      cy.findByText("RC1").should("be.visible");
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
      cy.findByText("v1.0").should("be.visible");
      cy.findByText("v1.1").should("be.visible");
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

      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("RC1").should("be.visible");
      cy.findByText("AM").should("not.exist");
    });

    it("should create an event with description", () => {
      cy.visit("/collection/root");

      cy.findByLabelText("calendar icon").click();
      cy.findByText("Add an event").click();

      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Date").type("5/12/2021");
      cy.findByText("Markdown supported").should("be.visible");
      cy.findByLabelText("Description").type("*1.0-rc1* release");
      cy.findByText("Create").click();

      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("RC1").should("be.visible");
      cy.findByText("1.0-rc1").should("be.visible");
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

      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("RC1").should("be.visible");
      cy.findByText(/10:20 AM/).should("be.visible");
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

      cy.findByText("RC2").should("be.visible");
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

      cy.findByText("Releases").should("be.visible");
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
      cy.findByText("RC1").should("be.visible");
    });

    it("should unarchive an event from the archive and undo", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", archived: true }],
      });

      cy.visit("/collection/root/timelines");
      openMenu("Releases");
      cy.findByText("View archived events").click();

      cy.findByText("Archived events").should("be.visible");
      openMenu("RC1");

      cy.findByText("Unarchive event").click();
      cy.findByText("No events found").should("be.visible");

      cy.findByText("Undo").click();
      cy.findByText("RC1").should("be.visible");
    });

    it("should delete an event", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", archived: true }],
      });

      cy.visit("/collection/root/timelines");
      openMenu("Releases");
      cy.findByText("View archived events").click();

      cy.findByText("Archived events").should("be.visible");
      openMenu("RC1");
      cy.findByText("Delete event").click();
      cy.findByText("Delete").click();
      cy.findByText("No events found").should("be.visible");
    });

    it("should show the back button in timeline details", () => {
      cy.createTimeline({ name: "Releases" });
      cy.createTimeline({ name: "Metrics" });

      cy.visit(`/collection/root/timelines/1`);
      cy.findByText("Releases");
      cy.icon("chevronleft").should("be.visible");
    });

    it("should not show the back button for the single timeline", () => {
      cy.createTimeline({ name: "Releases" });

      cy.visit(`/collection/root/timelines/1`);
      cy.findByText("Releases");
      cy.icon("chevronleft").should("not.exist");
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

      cy.findByText("Launches").should("be.visible");
      cy.findByText("Add an event").should("be.visible");
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

      cy.findByText("Launches").should("be.visible");
    });

    it("should archive a timeline and undo", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }, { name: "RC2" }],
      });

      cy.visit("/collection/root/timelines");
      openMenu("Releases");
      cy.findByText("Edit timeline details").click();
      cy.findByText("Archive timeline and all events").click();
      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("Add an event").should("be.visible");

      cy.findByText("Undo").click();
      cy.findByText("Releases").should("be.visible");
      cy.findByText("RC1").should("be.visible");
      cy.findByText("RC2").should("be.visible");
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

    it("should archive and unarchive a timeline", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }, { name: "RC2" }],
      });

      cy.visit("/collection/root/timelines");
      openMenu("Releases");
      cy.findByText("Edit timeline details").click();
      cy.findByText("Archive timeline and all events").click();

      openMenu("Our analytics events");
      cy.findByText("View archived timelines").click();

      openMenu("Releases");
      cy.findByText("Unarchive timeline").click();
      cy.findByText("No timelines found");
      cy.get(".Modal").within(() => {
        cy.icon("chevronleft").click();
      });
      cy.findByText("Releases");
    });

    it("should archive and delete a timeline", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }, { name: "RC2" }],
      });

      cy.visit("/collection/root/timelines");
      openMenu("Releases");
      cy.findByText("Edit timeline details").click();
      cy.findByText("Archive timeline and all events").click();

      openMenu("Our analytics events");
      cy.findByText("View archived timelines").click();

      openMenu("Releases");
      cy.findByText("Delete timeline").click();
      cy.findByText("Delete").click();
      cy.findByText("No timelines found");
      cy.get(".Modal").within(() => {
        cy.icon("chevronleft").click();
      });
      cy.findByText("Our analytics events");
    });
  });

  describe("as readonly user", () => {
    it("should not allow creating new timelines in collections", () => {
      cy.signIn("readonly");
      cy.visit("/collection/root");

      cy.findByLabelText("calendar icon").click();
      cy.findByText("Our analytics events").should("be.visible");
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
      cy.findByText("Releases").should("be.visible");
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
