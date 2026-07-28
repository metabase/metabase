const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Orders over time",
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
};

describe("scenarios > dashboard cards > timeline events", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should render events of a timeline enabled through dashcard settings", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Releases" },
      events: [
        { name: "RC1", timestamp: "2027-10-20T00:00:00Z", icon: "star" },
      ],
    });
    H.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      },
    );

    cy.log("no events are shown before the timeline is enabled");
    H.getDashboardCard()
      .findByTestId("timeline-events-band")
      .should("not.exist");

    H.editDashboard();
    H.showDashboardCardActions();
    cy.icon("palette").click();

    H.modal().within(() => {
      cy.findByTestId("chartsettings-sidebar").findByText("Display").click();
      cy.findByTestId("timeline-events-setting")
        .findByLabelText("Releases")
        .click();

      cy.log("the settings preview renders the event");
      H.timelineEventChip("RC1").should("be.visible");

      cy.button("Done").click();
    });

    H.saveDashboard();

    cy.log("the saved dashboard shows the event with its hover card");
    H.timelineEventChip("RC1").should("be.visible").realHover();
    cy.findByTestId("timeline-event-popover")
      .findByText("RC1")
      .should("be.visible");
  });

  it("should not show events from collections the viewer cannot see", () => {
    H.createTimelineWithEvents({
      timeline: {
        name: "Secret plans",
        collection_id: ADMIN_PERSONAL_COLLECTION_ID,
      },
      events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
    }).then(({ timeline }) => {
      H.createQuestionAndDashboard({
        questionDetails,
        cardDetails: {
          visualization_settings: {
            "timeline.selected_timeline_ids": [timeline.id],
          },
        },
      }).then(({ body: { dashboard_id } }) => {
        cy.wrap(dashboard_id).as("dashboardId");
      });
    });

    cy.log("the admin can see the event");
    cy.get("@dashboardId").then((dashboardId) => {
      H.visitDashboard(dashboardId);
    });
    H.timelineEventChip("RC1").should("be.visible");

    cy.log("a viewer without access to the timeline's collection sees nothing");
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/timeline?*").as("timelines");
    cy.get("@dashboardId").then((dashboardId) => {
      H.visitDashboard(dashboardId);
    });
    cy.wait("@timelines");
    H.getDashboardCard().within(() => {
      cy.findByTestId("visualization-root").should("be.visible");
      cy.findByTestId("timeline-events-band").should("not.exist");
    });
  });
});
