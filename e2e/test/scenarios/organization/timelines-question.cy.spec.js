import {
  restore,
  visitQuestion,
  rightSidebar,
  visitQuestionAdhoc,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > organization > timelines > question", () => {
  beforeEach(() => {
    restore();
  });

  describe("as admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      cy.intercept("GET", "/api/collection/root").as("getCollection");
      cy.intercept("POST", "/api/timeline-event").as("createEvent");
      cy.intercept("PUT", "/api/timeline-event/**").as("updateEvent");
    });

    it("should create the first event and timeline", () => {
      visitQuestion(3);
      cy.wait("@getCollection");
      cy.findByText("Visualization").should("be.visible");

      cy.icon("calendar").click();
      cy.findByText("Add an event").click();

      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Date").type("10/20/2018");
      cy.button("Create").click();
      cy.wait("@createEvent");

      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("RC1").should("be.visible");
    });

    it("should create an event within the default timeline", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2018-10-20T00:00:00Z" }],
      });

      visitQuestion(3);
      cy.wait("@getCollection");
      cy.findByText("Visualization").should("be.visible");

      cy.icon("calendar").click();
      cy.findByText("Add an event").click();

      cy.findByLabelText("Event name").type("RC2");
      cy.findByLabelText("Date").type("10/30/2018");
      cy.button("Create").click();
      cy.wait("@createEvent");

      cy.findByText("Releases").should("be.visible");
      cy.findByText("RC1").should("be.visible");
      cy.findByText("RC2").should("be.visible");
    });

    it("should display all events in data view", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [
          { name: "v1", timestamp: "2015-01-01T00:00:00Z" },
          { name: "v2", timestamp: "2017-01-01T00:00:00Z" },
          { name: "v3", timestamp: "2020-01-01T00:00:00Z" },
        ],
      });

      visitQuestion(3);
      cy.wait("@getCollection");
      cy.findByText("Visualization").should("be.visible");

      cy.findByLabelText("calendar icon").click();
      cy.findByText("v1").should("not.exist");
      cy.findByText("v2").should("be.visible");
      cy.findByText("v3").should("be.visible");

      cy.findByLabelText("table2 icon").click();
      cy.findByText("v1").should("be.visible");
      cy.findByText("v2").should("be.visible");
      cy.findByText("v3").should("be.visible");
    });

    it("should edit an event", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2018-10-20T00:00:00Z" }],
      });

      visitQuestion(3);
      cy.wait("@getCollection");
      cy.findByText("Visualization").should("be.visible");

      cy.icon("calendar").click();
      cy.findByText("Releases").should("be.visible");
      rightSidebar().within(() => cy.icon("ellipsis").click());
      cy.findByText("Edit event").click();

      cy.findByLabelText("Event name").clear().type("RC2");
      cy.findByText("Update").click();
      cy.wait("@updateEvent");

      cy.findByText("Releases").should("be.visible");
      cy.findByText("RC2").should("be.visible");
    });

    it("should move an event", () => {
      cy.createTimeline({
        name: "Releases",
      });
      cy.createTimelineWithEvents({
        timeline: { name: "Builds" },
        events: [{ name: "RC2", timestamp: "2018-10-20T00:00:00Z" }],
      });

      visitQuestion(3);
      cy.wait("@getCollection");
      cy.findByText("Visualization").should("be.visible");

      cy.icon("calendar").click();
      cy.findByText("Builds").should("be.visible");
      rightSidebar().within(() => cy.icon("ellipsis").click());
      cy.findByText("Move event").click();
      cy.findByText("Releases").click();
      cy.button("Move").click();
      cy.wait("@updateEvent");

      cy.findByText("Builds").should("not.exist");
      cy.findByText("Releases").should("be.visible");
    });

    it("should archive and unarchive an event", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2018-10-20T00:00:00Z" }],
      });

      visitQuestion(3);
      cy.wait("@getCollection");
      cy.findByText("Visualization").should("be.visible");

      cy.icon("calendar").click();
      cy.findByText("Releases").should("be.visible");
      rightSidebar().within(() => cy.icon("ellipsis").click());
      cy.findByText("Archive event").click();
      cy.wait("@updateEvent");
      cy.findByText("RC1").should("not.exist");

      cy.findByText("Undo").click();
      cy.wait("@updateEvent");
      cy.findByText("RC1").should("be.visible");
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
      cy.icon("calendar").click();

      cy.findByText("Releases").should("be.visible");
      cy.findByText("Release notes").should("be.visible");
    });

    it("should show events for ad-hoc questions", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2018-10-20T00:00:00Z" }],
      });

      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.CREATED_AT, null]],
          },
          database: SAMPLE_DB_ID,
        },
        display: "bar",
        visualization_settings: {
          "graph.dimensions": ["TOTAL"],
          "graph.metrics": ["count"],
        },
      });

      cy.findByText("Visualization").should("be.visible");
      cy.findByLabelText("star icon").should("be.visible");
    });

    it("should not show events for non-timeseries questions", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2018-10-20T00:00:00Z" }],
      });

      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.TOTAL, { binning: { strategy: "default" } }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "bar",
        visualization_settings: {
          "graph.dimensions": ["TOTAL"],
          "graph.metrics": ["count"],
        },
      });

      cy.findByText("Visualization").should("be.visible");
      cy.findByLabelText("star icon").should("not.exist");
    });

    it("should show events for native queries", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2018-10-20T00:00:00Z" }],
      });

      visitQuestionAdhoc({
        dataset_query: {
          type: "native",
          native: {
            query: "SELECT ID, CREATED_AT FROM ORDERS",
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
        visualization_settings: {
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["ID"],
        },
      });

      cy.findByText("Visualization").should("be.visible");
      cy.findByLabelText("star icon").should("be.visible");
    });

    it("should toggle individual event visibility", () => {
      cy.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [
          { name: "RC1", timestamp: "2018-10-20T00:00:00Z", icon: "cloud" },
        ],
      });

      cy.createTimelineWithEvents({
        timeline: { name: "Timeline for collection", collection_id: 1 },
        events: [
          { name: "TC1", timestamp: "2016-05-20T00:00:00Z", icon: "warning" },
        ],
      });

      visitQuestion(3);

      cy.findByText("Visualization").should("be.visible");
      cy.findByLabelText("cloud icon").should("be.visible");

      // should hide individual events from chart if hidden in sidebar
      cy.icon("calendar").click();
      cy.findByText("Releases").click();
      toggleEventVisibility("RC1");

      cy.get(".x.axis").within(() => {
        cy.findByLabelText("cloud icon").should("not.exist");
      });

      // should show individual events in chart again
      toggleEventVisibility("RC1");

      cy.get(".x.axis").within(() => {
        cy.findByLabelText("cloud icon").should("be.visible");
      });

      // should show a newly created event
      cy.button("Add an event").click();
      cy.findByLabelText("Event name").type("RC2");
      cy.findByLabelText("Date").type("10/20/2017");
      cy.button("Create").click();
      cy.wait("@createEvent");

      cy.get(".x.axis").within(() => {
        cy.findByLabelText("star icon").should("be.visible");
      });

      // should then hide the newly created event
      toggleEventVisibility("RC2");

      cy.get(".x.axis").within(() => {
        cy.findByLabelText("star icon").should("not.exist");
      });

      // its timeline, visible but having one hidden event
      // should display its checkbox with a "dash" icon
      cy.findByText("Releases")
        .closest("[aria-label=Timeline card header]")
        .within(() => {
          cy.icon("dash").should("be.visible");

          // Hide the timeline then show it again
          cy.findByRole("checkbox").click();
          cy.findByRole("checkbox").click();
        });

      // once timeline is visible, all its events should be visible
      cy.get(".x.axis").within(() => {
        cy.findByLabelText("star icon").should("be.visible");
        cy.findByLabelText("cloud icon").should("be.visible");
      });

      // should initialize events in a hidden timelime
      // with event checkboxes unchecked
      cy.findByText("Timeline for collection").click();

      cy.findByText("TC1")
        .closest("[aria-label=Timeline event card]")
        .within(() => {
          cy.findByRole("checkbox").should("not.be.checked");
        });

      // making a hidden timeline visible
      // should make its events automatically visible
      cy.findByText("Timeline for collection")
        .closest("[aria-label=Timeline card header]")
        .within(() => cy.findByRole("checkbox").click());

      cy.get(".x.axis").within(() => {
        cy.findByLabelText("warning icon").should("be.visible");
      });

      // events whose timeline was invisible on page load
      // should be hideable once their timelines are visible
      toggleEventVisibility("TC1");

      cy.get(".x.axis").within(() => {
        cy.findByLabelText("warning icon").should("not.exist");
      });
    });
  });

  describe("as readonly user", () => {
    it("should not allow creating default timelines", () => {
      cy.signIn("readonly");
      visitQuestion(3);
      cy.findByText("Created At").should("be.visible");

      cy.icon("calendar").click();
      cy.findByText(/Events in Metabase/);
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
      cy.findByText("Created At").should("be.visible");

      cy.icon("calendar").click();
      cy.findByText("Releases").should("be.visible");
      cy.findByText("Add an event").should("not.exist");
      rightSidebar().within(() => cy.icon("ellipsis").should("not.exist"));
    });
  });
});

function toggleEventVisibility(eventName) {
  cy.findByText(eventName)
    .closest("[aria-label=Timeline event card]")
    .within(() => {
      cy.findByRole("checkbox").click();
    });
}
