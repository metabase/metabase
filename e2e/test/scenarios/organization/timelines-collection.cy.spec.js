import {
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  restore,
  getFullName,
  popover,
} from "e2e/support/helpers";

import { USERS } from "e2e/support/cypress_data";

const { admin } = USERS;

describe("scenarios > organization > timelines > collection", () => {
  beforeEach(() => {
    restore();
    cy.intercept("PUT", "/api/collection/*").as("updateCollection");
    cy.intercept("POST", "/api/timeline").as("createTimeline");
    cy.intercept("PUT", "/api/timeline/*").as("updateTimeline");
    cy.intercept("DELETE", "/api/timeline/*").as("deleteTimeline");
    cy.intercept("POST", "/api/timeline-event").as("createEvent");
    cy.intercept("PUT", "/api/timeline-event/*").as("updateEvent");
    cy.intercept("DELETE", "/api/timeline-event/*").as("deleteEvent");
  });

  describe("as admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("should create the first event and timeline", () => {
      cy.visit("/collection/root");
      cy.icon("calendar").click();

      cy.findByText("Add an event").click();
      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Date").type("10/20/2020");
      cy.button("Create").click();
      cy.wait("@createEvent");

      cy.findByText("RC1").should("be.visible");
      cy.findByText("October 20, 2020").should("be.visible");
      cy.icon("star").should("be.visible");

      cy.findByText("Add an event").click();
      cy.findByLabelText("Event name").type("RC2");
      cy.findByLabelText("Date").type("5/12/2021");
      cy.findByText("Star").click();
      cy.findByText("Balloons").click();
      cy.button("Create").click();
      cy.wait("@createEvent");

      cy.findByText("RC2").should("be.visible");
      cy.findByText("May 12, 2021").should("be.visible");
      cy.icon("balloons").should("be.visible");
    });

    it("should create an event in a personal collection", () => {
      cy.visit("/collection/root");
      cy.findByText("Your personal collection").click();
      cy.icon("calendar").click();

      cy.findByText("Add an event").click();
      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Date").type("10/20/2020");
      cy.button("Create").click();
      cy.wait("@createEvent");

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

      cy.icon("calendar").click();
      cy.findByText("Add an event").click();

      cy.findByLabelText("Event name").type("RC1");

      getModal().within(() => {
        cy.findByRole("button", { name: "calendar icon" }).click();
      });
      cy.findByText("15").click();
      cy.findByText("Done").click();
      cy.findByText("Create").click();
      cy.wait("@createEvent");

      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("RC1").should("be.visible");
      cy.findByText("AM").should("not.exist");
    });

    it("should create an event with description", () => {
      cy.visit("/collection/root");

      cy.icon("calendar").click();
      cy.findByText("Add an event").click();

      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Date").type("5/12/2021");
      cy.findByText("Markdown supported").should("be.visible");
      cy.findByLabelText("Description").type("*1.0-rc1* release");
      cy.findByText("Create").click();
      cy.wait("@createEvent");

      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("RC1").should("be.visible");
      cy.findByText("1.0-rc1").should("be.visible");
    });

    it("should create an event with date and time", () => {
      cy.visit("/collection/root");

      cy.icon("calendar").click();
      cy.findByText("Add an event").click();

      cy.findByLabelText("Event name").type("RC1");

      getModal().within(() => {
        cy.findByRole("button", { name: "calendar icon" }).click();
      });
      cy.findByText("15").click();
      cy.findByText("Add time").click();
      cy.findByLabelText("Hours").clear().type("10");
      cy.findByLabelText("Minutes").clear().type("20");
      cy.findByText("Done").click();
      cy.findByText("Create").click();
      cy.wait("@createEvent");

      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("RC1").should("be.visible");
      cy.findByText(/10:20 AM/).should("be.visible");
    });

    it("should create an event with date and time at midnight", () => {
      cy.visit("/collection/root");

      cy.icon("calendar").click();
      cy.findByText("Add an event").click();

      cy.findByLabelText("Event name").type("RC1");

      getModal().within(() => {
        cy.findByRole("button", { name: "calendar icon" }).click();
      });
      cy.findByText("15").click();
      cy.findByText("Add time").click();
      cy.findByText("Done").click();
      cy.findByText("Create").click();
      cy.wait("@createEvent");

      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("RC1").should("be.visible");
      cy.findByText(/12:00 AM/).should("be.visible");
    });

    it("should edit an event", () => {
      cy.createTimelineWithEvents({ events: [{ name: "RC1" }] });
      cy.visit("/collection/root/timelines");

      openMenu("RC1");
      cy.findByText("Edit event").click();
      cy.findByLabelText("Event name").clear().type("RC2");
      cy.button("Update").click();
      cy.wait("@updateEvent");

      cy.findByText("RC2").should("be.visible");
    });

    it("should move an event", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }],
      });
      cy.createTimelineWithEvents({
        timeline: { name: "Metrics" },
        events: [{ name: "RC2" }],
      });

      cy.visit("/collection/root/timelines");
      cy.findByText("Metrics").click();
      openMenu("RC2");
      cy.findByText("Move event").click();
      cy.findByText("Releases").click();
      getModal().within(() => cy.button("Move").click());
      cy.wait("@updateEvent");
      cy.findByText("RC2").should("not.exist");

      cy.icon("chevronleft").click();
      cy.findByText("Releases").click();
      cy.findByText("RC1");
      cy.findByText("RC2");
    });

    it("should move an event and undo", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }],
      });
      cy.createTimelineWithEvents({
        timeline: { name: "Metrics" },
        events: [{ name: "RC2" }],
      });

      cy.visit("/collection/root/timelines");
      cy.findByText("Metrics").click();
      openMenu("RC2");
      cy.findByText("Move event").click();
      cy.findByText("Releases").click();
      getModal().within(() => cy.button("Move").click());
      cy.wait("@updateEvent");
      cy.findByText("RC2").should("not.exist");

      cy.findByText("Undo").click();
      cy.wait("@updateEvent");
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
      cy.wait("@updateEvent");

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
      cy.wait("@updateEvent");
      cy.findByText("RC1").should("not.exist");

      cy.findByText("Undo").click();
      cy.wait("@updateEvent");
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
      cy.wait("@updateEvent");
      cy.findByText("No events found").should("be.visible");

      cy.findByText("Undo").click();
      cy.wait("@updateEvent");
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
      cy.wait("@deleteEvent");
      cy.findByText("No events found").should("be.visible");
    });

    it("should allow navigating back to the list of timelines", () => {
      cy.createTimeline({ name: "Releases" });
      cy.createTimeline({ name: "Metrics" });

      cy.visit(`/collection/root/timelines/1`);
      cy.findByText("Releases");

      cy.icon("chevronleft").click();
      cy.findByText("Releases");
      cy.findByText("Metrics");
    });

    it("should not allow navigating back when there is only one timeline in a collection", () => {
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
      cy.findByLabelText("Name").type("Launches");
      cy.findByText("Create").click();
      cy.wait("@createTimeline");

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
      cy.findByLabelText("Name").clear().type("Launches");
      cy.findByText("Update").click();
      cy.wait("@updateTimeline");

      cy.findByText("Launches").should("be.visible");
    });

    it("should move a timeline", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Events", default: true },
        events: [{ name: "RC1" }],
      });

      cy.visit("/collection/root/timelines");
      openMenu("Our analytics events");
      cy.findByText("Move timeline").click();

      getModal().within(() => {
        cy.findByText("My personal collection").click();
        cy.button("Move").click();
        cy.wait("@updateTimeline");
      });

      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText(`${getFullName(admin)}'s Personal Collection`).should(
        "be.visible",
      );
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
      cy.wait("@updateTimeline");
      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("Add an event").should("be.visible");

      cy.findByText("Undo").click();
      cy.wait("@updateTimeline");
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
      cy.wait("@updateTimeline");

      openMenu("Our analytics events");
      cy.findByText("View archived timelines").click();

      openMenu("Releases");
      cy.findByText("Unarchive timeline").click();
      cy.wait("@updateTimeline");
      cy.findByText("No timelines found");
      getModal().icon("chevronleft").click();
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
      cy.wait("@updateTimeline");

      openMenu("Our analytics events");
      cy.findByText("View archived timelines").click();

      openMenu("Releases");
      cy.findByText("Delete timeline").click();
      cy.findByText("Delete").click();
      cy.wait("@deleteTimeline");
      cy.findByText("No timelines found");
      getModal().icon("chevronleft").click();
      cy.findByText("Our analytics events");
    });

    it("should preserve collection names for default timelines", () => {
      cy.visit("/");
      cy.findByText("First collection").click();

      cy.icon("calendar").click();
      cy.findByText("Add an event").click();
      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Date").type("10/20/2020");
      cy.button("Create").click();
      cy.findByText("First collection events");
      cy.wait("@createTimeline");
      cy.icon("close").click();

      cy.findByDisplayValue("First collection")
        .clear()
        .type("1st collection")
        .blur();
      cy.wait("@updateCollection");

      cy.icon("calendar").click();
      openMenu("1st collection events");
      cy.findByText("Edit timeline details").click();
      cy.findByLabelText("Name").clear().type("Releases");
      cy.button("Update").click();
      cy.wait("@updateTimeline");
      cy.findByText("Releases");
    });

    it("should use custom date formatting settings", () => {
      cy.createTimelineWithEvents({
        events: [{ name: "RC1", timestamp: "2022-10-12T18:15:30Z" }],
      });
      setFormattingSettings({
        "type/Temporal": { date_style: "YYYY/M/D" },
      });
      cy.visit("/collection/root/timelines");

      openMenu("RC1");
      cy.findByText("Edit event").click();
      cy.findByDisplayValue("2022/10/12").should("be.visible");

      cy.findByLabelText("Date").clear().type("2022/10/15");
      cy.button("Update").click();
      cy.wait("@updateEvent");
      cy.findByText("2022/10/15").should("be.visible");
    });

    it("should use custom time formatting settings", () => {
      cy.createTimelineWithEvents({
        events: [{ name: "RC1", timestamp: "2022-10-12T18:15:30Z" }],
      });
      setFormattingSettings({
        "type/Temporal": { time_style: "HH:mm" },
      });
      cy.visit("/collection/root/timelines");

      openMenu("RC1");
      cy.findByText("Edit event").click();
      getModal().within(() => {
        cy.findByRole("button", { name: "calendar icon" }).click();
      });
      popover().within(() => {
        cy.findByText("Add time").click();
        cy.findByText("AM").should("not.exist");
      });
    });
  });

  describe("as readonly user", () => {
    it("should not allow creating new timelines in collections", () => {
      cy.signIn("readonly");
      cy.visit("/collection/root");

      cy.icon("calendar").click();
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
      cy.icon("calendar").click();
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
    cy.icon("calendar").click();

    cy.findByText("Add an event").click();
    cy.findByLabelText("Event name").type("Event");
    cy.findByLabelText("Date").type("10/20/2020");

    // 4 - new_event_created
    // 5 - pageview
    cy.button("Create").click();

    expectGoodSnowplowEvents(5);
  });
});

const getModal = () => {
  return cy.get(".Modal");
};

const openMenu = name => {
  return cy.findByText(name).parent().parent().icon("ellipsis").click();
};

const setFormattingSettings = settings => {
  cy.request("PUT", "api/setting/custom-formatting", {
    value: settings,
  });
};
