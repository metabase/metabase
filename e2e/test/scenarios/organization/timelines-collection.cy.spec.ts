const { H } = cy;
import { USERS } from "e2e/support/cypress_data";

const { admin } = USERS;

// The UI of the collection timeline modals is covered by Jest in
// `frontend/src/metabase/timelines/collections/collection-timelines.unit.spec.tsx`.
// These tests check that the writes reach the backend and survive a reload.
describe("scenarios > organization > timelines > collection", () => {
  beforeEach(() => {
    H.restore();
    cy.intercept("POST", "/api/timeline").as("createTimeline");
    cy.intercept("PUT", "/api/timeline/*").as("updateTimeline");
    cy.intercept("DELETE", "/api/timeline/*").as("deleteTimeline");
    cy.intercept("POST", "/api/timeline-event").as("createEvent");
    cy.intercept("PUT", "/api/timeline-event/*").as("updateEvent");
    cy.intercept("DELETE", "/api/timeline-event/*").as("deleteEvent");
    cy.signInAsAdmin();
  });

  it("should create, edit, archive, unarchive and delete an event", () => {
    cy.visit("/collection/root");
    cy.findByTestId("collection-menu").icon("calendar").click();

    H.modal().button("Create event").click();
    cy.findByTestId("event-form").within(() => {
      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Description").type("*1.0-rc1* release");
      cy.button("Add time").click();
      cy.findByLabelText("Time").type("10:20");
      cy.findByLabelText("Date").clear().type("10/20/2026");
      cy.button("Create").click();
    });
    cy.wait(["@createTimeline", "@createEvent"]);

    cy.reload();
    H.modal().within(() => {
      cy.findByText("Our analytics events").should("be.visible");
      cy.findByTestId("event-list").within(() => {
        cy.findByText("RC1").should("be.visible");
        cy.findByText(/October 20, 2026, 10:20 AM/).should("be.visible");
        cy.findByText("1.0-rc1").should("be.visible");
      });
    });

    openMenu("RC1");
    H.popover().findByText("Edit event").click();
    cy.findByLabelText("Event name").clear().type("RC2");
    cy.button("Update").click();
    cy.wait("@updateEvent");

    cy.reload();
    cy.findByTestId("event-list").findByText("RC2").should("be.visible");

    openMenu("RC2");
    H.popover().findByText("Edit event").click();
    cy.button("Archive event").click();
    cy.wait("@updateEvent");

    cy.reload();
    H.modal().within(() => {
      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("RC2").should("not.exist");
    });

    openMenu("Our analytics events");
    H.popover().findByText("View archived events").click();
    openMenu("RC2");
    H.popover().findByText("Unarchive event").click();
    cy.wait("@updateEvent");

    cy.reload();
    H.modal().within(() => {
      cy.findByText("No events found").should("be.visible");
      cy.icon("chevronleft").click();
      cy.findByTestId("event-list").findByText("RC2").should("be.visible");
    });

    openMenu("RC2");
    H.popover().findByText("Archive event").click();
    cy.wait("@updateEvent");
    openMenu("Our analytics events");
    H.popover().findByText("View archived events").click();
    openMenu("RC2");
    H.popover().findByText("Delete event").click();
    H.modal().button("Delete").click();
    cy.wait("@deleteEvent");

    cy.reload();
    H.modal().within(() => {
      cy.findByText("No events found").should("be.visible");
      cy.icon("chevronleft").click();
      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("RC2").should("not.exist");
    });
  });

  it("should create, edit, archive, unarchive and delete a timeline", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Releases" },
      events: [{ name: "RC1" }],
    });

    cy.visit("/collection/root/timelines");
    openMenu("Releases");
    H.popover().findByText("New timeline").click();
    cy.findByLabelText("Name").type("Launches");
    cy.findByLabelText("Default icon").click();
    H.popover().findByText("Cake").click();
    cy.button("Create").click();
    cy.wait("@createTimeline");

    openMenu("Launches");
    H.popover().findByText("Edit timeline details").click();
    cy.findByLabelText("Name").clear().type("Rockets");
    cy.button("Update").click();
    cy.wait("@updateTimeline");

    cy.reload();
    H.modal().within(() => {
      cy.findByText("Rockets").should("be.visible");
      cy.icon("chevronleft").click();
      cy.findByText("Releases").should("be.visible");
      cy.findByText("Rockets").should("be.visible");
      cy.icon("cake").should("be.visible");
      cy.findByText("Rockets").click();
    });

    openMenu("Rockets");
    H.popover().findByText("Edit timeline details").click();
    cy.button("Archive timeline and all events").click();
    cy.wait("@updateTimeline");

    cy.reload();
    H.modal().within(() => {
      cy.findByText("Releases").should("be.visible");
      cy.findByText("Rockets").should("not.exist");
    });

    openMenu("Releases");
    H.popover().findByText("View archived timelines").click();
    openMenu("Rockets");
    H.popover().findByText("Unarchive timeline").click();
    cy.wait("@updateTimeline");

    cy.reload();
    H.modal().within(() => {
      cy.findByText("No timelines found").should("be.visible");
      cy.icon("chevronleft").click();
      cy.findByText("Releases").should("be.visible");
      cy.findByText("Rockets").should("be.visible").click();
    });

    openMenu("Rockets");
    H.popover().findByText("Edit timeline details").click();
    cy.button("Archive timeline and all events").click();
    cy.wait("@updateTimeline");
    openMenu("Releases");
    H.popover().findByText("View archived timelines").click();
    openMenu("Rockets");
    H.popover().findByText("Delete timeline").click();
    H.modal().button("Delete").click();
    cy.wait("@deleteTimeline");

    cy.reload();
    H.modal().findByText("No timelines found").should("be.visible");
  });

  it("should move an event to another timeline", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Releases" },
      events: [{ name: "RC1" }],
    });
    H.createTimelineWithEvents({
      timeline: { name: "Metrics" },
      events: [{ name: "RC2" }],
    });

    cy.visit("/collection/root/timelines");
    H.modal().findByText("Metrics").click();
    openMenu("RC2");
    H.popover().findByText("Move event").click();
    H.modal().within(() => {
      cy.findByText("Releases").click();
      cy.button("Move").click();
    });
    cy.wait("@updateEvent");

    cy.reload();
    H.modal().within(() => {
      cy.findByText("Metrics").should("be.visible");
      cy.findByText("RC2").should("not.exist");
      cy.icon("chevronleft").click();
      cy.findByText("Releases").click();
      cy.findByTestId("event-list").within(() => {
        cy.findByText("RC1").should("be.visible");
        cy.findByText("RC2").should("be.visible");
      });
    });
  });

  it("should move a timeline", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Events", default: true },
      events: [{ name: "RC1" }],
    });

    cy.visit("/collection/root/timelines");
    openMenu("Our analytics events");
    H.popover().findByText("Move timeline").click();

    H.entityPickerModal().within(() => {
      cy.findByText("Bobby Tables's Personal Collection").click();
      cy.button("Move").click();
      cy.wait("@updateTimeline");
    });

    H.modal().within(() => {
      cy.findByText("Our analytics events").should("be.visible");
      cy.button(/close/i).click();
    });
    H.main()
      .findByText(`${H.getFullName(admin)}'s Personal Collection`)
      .should("be.visible");
  });
});

const openMenu = (name: string) => {
  return cy
    .findByText(name)
    .closest(":has(.Icon-ellipsis)")
    .icon("ellipsis")
    .click();
};
