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

  it("should show the dashboard collection's events by default and allow turning them off", () => {
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

    cy.log("the event renders without any configuration");
    H.timelineEventChip("RC1").should("be.visible").realHover();
    cy.findByTestId("timeline-event-popover")
      .findByText("RC1")
      .should("be.visible");

    cy.log("events can be turned off per dashcard");
    H.editDashboard();
    H.showDashboardCardActions();
    cy.icon("palette").click();

    H.modal().within(() => {
      cy.findByTestId("chartsettings-sidebar").findByText("Display").click();
      cy.findByLabelText("Timeline events").click();

      cy.log("the settings preview hides the event");
      H.timelineEventChip("RC1").should("not.exist");

      cy.button("Done").click();
    });

    H.saveDashboard();

    cy.log("the saved dashboard no longer shows the event");
    H.getDashboardCard()
      .findByTestId("timeline-events-band")
      .should("not.exist");
  });

  it("should only show events from the dashboard's own collection", () => {
    H.createTimelineWithEvents({
      timeline: {
        name: "Secret plans",
        collection_id: ADMIN_PERSONAL_COLLECTION_ID,
      },
      events: [{ name: "Secret event", timestamp: "2027-10-20T00:00:00Z" }],
    });
    H.createTimelineWithEvents({
      timeline: { name: "Releases" },
      events: [
        { name: "Root event", timestamp: "2027-06-10T00:00:00Z", icon: "star" },
      ],
    });
    H.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      },
    );

    cy.log("the root-collection dashboard shows only root-collection events");
    H.timelineEventChip("Root event").should("be.visible");
    H.getDashboardCard().findByLabelText("Secret event").should("not.exist");
  });
});
