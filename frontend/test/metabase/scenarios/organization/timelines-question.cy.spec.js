import {
  restore,
  visitQuestion,
  sidebar,
  visitQuestionAdhoc,
} from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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
      sidebar().within(() => cy.icon("ellipsis").click());
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
      sidebar().within(() => cy.icon("ellipsis").click());
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
      sidebar().within(() => cy.icon("ellipsis").click());
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
      sidebar().within(() => cy.icon("ellipsis").should("not.exist"));
    });
  });
});
