import { H } from "e2e/support";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > organization > timelines > question", () => {
  beforeEach(() => {
    H.restore();
  });

  describe("as admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      cy.intercept("GET", "/api/collection/root").as("getCollection");
      cy.intercept("POST", "/api/timeline-event").as("createEvent");
      cy.intercept("PUT", "/api/timeline-event/**").as("updateEvent");
    });

    it("should create the first event and timeline", () => {
      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      cy.wait("@getCollection");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Visualization").should("be.visible");

      cy.icon("calendar").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add an event").click();

      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Date").type("10/20/2024");
      cy.button("Create").click();
      cy.wait("@createEvent");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Our analytics events").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("RC1").should("be.visible");
    });

    it("should create an event within the default timeline", () => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2024-10-20T00:00:00Z" }],
      });

      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      cy.wait("@getCollection");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Visualization").should("be.visible");

      cy.icon("calendar").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add an event").click();

      cy.findByLabelText("Event name").type("RC2");
      cy.findByLabelText("Date").type("10/30/2024");
      cy.button("Create").click();
      cy.wait("@createEvent");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Releases").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("RC1").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("RC2").should("be.visible");
    });

    it("should display all events in data view", () => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [
          { name: "v1", timestamp: "2027-01-01T00:00:00Z" },
          { name: "v2", timestamp: "2023-01-01T00:00:00Z" },
          { name: "v3", timestamp: "2026-01-01T00:00:00Z" },
        ],
      });

      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      cy.wait("@getCollection");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Visualization").should("be.visible");

      cy.findByLabelText("calendar icon").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("v1").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("v2").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("v3").should("be.visible");

      cy.findByLabelText("table2 icon").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("v1").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("v2").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("v3").should("be.visible");
    });

    it("should edit an event", () => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2024-10-20T00:00:00Z" }],
      });

      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      cy.wait("@getCollection");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Visualization").should("be.visible");

      cy.icon("calendar").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Releases").should("be.visible");
      H.rightSidebar().icon("ellipsis").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit event").click();

      cy.findByLabelText("Event name").clear().type("RC2");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Update").click();
      cy.wait("@updateEvent");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Releases").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("RC2").should("be.visible");
    });

    it("should move an event", () => {
      H.createTimeline({ name: "Releases" });
      H.createTimelineWithEvents({
        timeline: { name: "Builds" },
        events: [{ name: "RC2", timestamp: "2024-10-20T00:00:00Z" }],
      });

      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      cy.wait("@getCollection");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Visualization").should("be.visible");

      cy.icon("calendar").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Builds").should("be.visible");
      H.rightSidebar().icon("ellipsis").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Move event").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Releases").click();
      cy.button("Move").click();
      cy.wait("@updateEvent");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Builds").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Releases").should("be.visible");
    });

    it("should archive and unarchive an event", () => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2024-10-20T00:00:00Z" }],
      });

      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      cy.wait("@getCollection");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Visualization").should("be.visible");

      cy.icon("calendar").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Releases").should("be.visible");
      H.rightSidebar().icon("ellipsis").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Archive event").click();
      cy.wait("@updateEvent");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("RC1").should("not.exist");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Undo").click();
      cy.wait("@updateEvent");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("RC1").should("be.visible");
    });

    it("should support markdown in event description", () => {
      H.createTimelineWithEvents({
        timeline: {
          name: "Releases",
        },
        events: [
          {
            name: "RC1",
            description: "[Release notes](https://metabase.test)",
            timestamp: "2024-10-20T00:00:00Z",
          },
        ],
      });

      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      cy.icon("calendar").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Releases").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Release notes").should("be.visible");
    });

    it("should show events for ad-hoc questions", () => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2024-10-20T00:00:00Z" }],
      });

      H.visitQuestionAdhoc({
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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Visualization").should("be.visible");
      H.echartsIcon("star").should("be.visible");
    });

    it("should not show events for non-timeseries questions", () => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2024-10-20T00:00:00Z" }],
      });

      H.visitQuestionAdhoc({
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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Visualization").should("be.visible");
      H.echartsIcon("star").should("not.exist");
    });

    it("should show events for native queries", () => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2024-10-20T00:00:00Z" }],
      });

      H.visitQuestionAdhoc({
        dataset_query: {
          type: "native",
          native: {
            query: "SELECT TOTAL, CREATED_AT FROM ORDERS",
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
        visualization_settings: {
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["TOTAL"],
        },
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Visualization").should("be.visible");
      H.echartsIcon("star").should("be.visible");
    });

    it("should toggle individual event visibility", () => {
      cy.request("POST", "/api/collection", {
        name: "Parent",
        parent_id: null,
      }).then(({ body: { id: PARENT_COLLECTION_ID } }) => {
        H.createTimelineWithEvents({
          timeline: { name: "Releases" },
          events: [
            { name: "RC1", timestamp: "2024-10-20T00:00:00Z", icon: "cloud" },
          ],
        });

        H.createTimelineWithEvents({
          timeline: {
            name: "Timeline for collection",
            collection_id: PARENT_COLLECTION_ID,
          },
          events: [
            { name: "TC1", timestamp: "2022-05-20T00:00:00Z", icon: "warning" },
          ],
        });

        H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);

        cy.findByTestId("view-footer")
          .findByText("Visualization")
          .should("be.visible");
        H.echartsIcon("cloud").should("be.visible");

        // should hide individual events from chart if hidden in sidebar
        cy.icon("calendar").click();
        cy.findByTestId("sidebar-content").findByText("Releases").click();
        toggleEventVisibility("RC1");

        H.echartsIcon("cloud").should("not.exist");

        // should show individual events in chart again
        toggleEventVisibility("RC1");

        H.echartsIcon("cloud").should("be.visible");

        // should show a newly created event
        cy.button("Add an event").click();
        cy.findByLabelText("Event name").type("RC2");
        cy.findByLabelText("Date").type("10/20/2023");
        cy.button("Create").click();
        cy.wait("@createEvent");

        H.echartsIcon("star").should("be.visible");

        // should then hide the newly created event
        toggleEventVisibility("RC2");

        H.echartsIcon("star").should("not.exist");

        // its timeline, visible but having one hidden event
        // should display its checkbox with a "dash" icon
        cy.findByTestId("sidebar-content")
          .findByText("Releases")
          .closest("[aria-label=Timeline card header]")
          .within(() => {
            cy.icon("dash").should("be.visible");

            // Hide the timeline then show it again
            cy.findByRole("checkbox").click();
            cy.findByRole("checkbox").click();
          });

        // once timeline is visible, all its events should be visible
        H.echartsIcon("star").should("be.visible");
        H.echartsIcon("cloud").should("be.visible");

        // should initialize events in a hidden timelime
        // with event checkboxes unchecked
        cy.findByTestId("sidebar-content")
          .findByText("Timeline for collection")
          .click();

        cy.findByTestId("sidebar-content")
          .findByText("TC1")
          .closest("[aria-label=Timeline event card]")
          .within(() => {
            cy.findByRole("checkbox").should("not.be.checked");
          });

        // making a hidden timeline visible
        // should make its events automatically visible
        cy.findByTestId("sidebar-content")
          .findByText("Timeline for collection")
          .closest("[aria-label=Timeline card header]")
          .within(() => cy.findByRole("checkbox").click());

        H.echartsIcon("warning").should("be.visible");

        // events whose timeline was invisible on page load
        // should be hideable once their timelines are visible
        toggleEventVisibility("TC1");

        H.echartsIcon("warning").should("not.exist");
      });
    });

    it("should color the event icon when hovering", () => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [
          { name: "RC1", timestamp: "2024-10-20T00:00:00Z", icon: "star" },
        ],
      });

      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);

      H.echartsIcon("star").should("be.visible");
      H.echartsIcon("star").realHover();
      H.echartsIcon("star", true).should("be.visible");
    });

    it("should open the sidebar when clicking an event icon", () => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [
          { name: "RC1", timestamp: "2024-10-20T00:00:00Z", icon: "star" },
        ],
      });

      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);

      H.echartsIcon("star").should("be.visible");
      H.echartsIcon("star").realClick();

      // event should be selected in sidebar
      timelineEventCard("RC1").should("be.visible");
      timelineEventCard("RC1").should(
        "have.css",
        "border-left",
        "4px solid rgb(80, 158, 227)",
      );

      // after clicking the icon again, it should be deselected in sidebar
      H.echartsIcon("star", true).click();
      timelineEventCard("RC1").should("be.visible");
      timelineEventCard("RC1").should(
        "have.css",
        "border-left",
        "4px solid rgba(0, 0, 0, 0)",
      );
    });

    it("should not filter out events in last period (metabase#23336)", () => {
      H.createTimelineWithEvents({
        events: [
          { name: "Last week", timestamp: "2026-04-21T12:00:00Z" },
          { name: "Last month", timestamp: "2026-04-27T12:00:00Z" },
          { name: "Last quarter", timestamp: "2026-05-10T12:00:00Z" },
          { name: "Last year", timestamp: "2026-09-10T12:00:00Z" },
        ],
      });

      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }],
            ],
            "source-table": ORDERS_ID,
          },
        },
      });

      cy.icon("calendar").click();

      // Week
      H.rightSidebar().within(() => {
        cy.findByText("Last week").should("exist");
        cy.findByText("Last month").should("not.exist");
        cy.findByText("Last quarter").should("not.exist");
        cy.findByText("Last year").should("not.exist");
      });

      // Month
      cy.findByTestId("timeseries-chrome").findByText("Week").click();
      H.popover().findByText("Month").click();
      cy.wait("@dataset");
      H.rightSidebar().within(() => {
        cy.findByText("Last week").should("exist");
        cy.findByText("Last month").should("exist");
        cy.findByText("Last quarter").should("not.exist");
        cy.findByText("Last year").should("not.exist");
      });

      // Quarter
      cy.findByTestId("timeseries-chrome").findByText("Month").click();
      H.popover().findByText("Quarter").click();
      cy.wait("@dataset");
      H.rightSidebar().within(() => {
        cy.findByText("Last week").should("exist");
        cy.findByText("Last month").should("exist");
        cy.findByText("Last quarter").should("exist");
        cy.findByText("Last year").should("not.exist");
      });

      // Year
      cy.findByTestId("timeseries-chrome").findByText("Quarter").click();
      H.popover().findByText("Year").click();
      cy.wait("@dataset");
      H.rightSidebar().within(() => {
        cy.findByText("Last week").should("exist");
        cy.findByText("Last month").should("exist");
        cy.findByText("Last quarter").should("exist");
        cy.findByText("Last year").should("exist");
      });
    });
  });

  describe("as readonly user", () => {
    it("should not allow creating default timelines", () => {
      cy.signIn("readonly");
      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Created At: Year").should("be.visible");

      cy.icon("calendar").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Events in Metabase/);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add an event").should("not.exist");
    });

    it("should not allow creating or editing events", () => {
      cy.signInAsAdmin();
      H.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2024-10-20T00:00:00Z" }],
      });
      cy.signOut();
      cy.signIn("readonly");
      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Created At: Year").should("be.visible");

      cy.icon("calendar").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Releases").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add an event").should("not.exist");
      H.rightSidebar().icon("ellipsis").should("not.exist");
    });
  });
});

function timelineEventCard(eventName) {
  return cy.findByText(eventName).closest("[aria-label=Timeline event card]");
}

function toggleEventVisibility(eventName) {
  timelineEventCard(eventName).within(() => {
    cy.findByRole("checkbox").click();
  });
}
