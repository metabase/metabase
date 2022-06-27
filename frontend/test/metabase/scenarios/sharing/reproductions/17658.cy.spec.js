import { restore, setupSMTP, visitDashboard } from "__support__/e2e/helpers";

describe("issue 17658", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/pulse/*").as("deletePulse");
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    moveDashboardToCollection("First collection");
  });

  it("should delete dashboard subscription from any collection (metabase#17658)", () => {
    visitDashboard(1);

    cy.icon("subscription").click();

    cy.findByText(/^Emailed monthly/).click();

    cy.findByText("Delete this subscription").click();
    cy.findByText(/^This dashboard will no longer be emailed to/).click();

    cy.button("Delete").click();

    cy.wait("@deletePulse").then(({ response }) => {
      expect(response.body.cause).not.to.exist;
      expect(response.statusCode).not.to.eq(500);
    });

    cy.button("Delete").should("not.exist");
  });
});

function moveDashboardToCollection(collectionName) {
  cy.request("GET", "/api/collection/tree?tree=true").then(
    ({ body: collections }) => {
      const { id } = collections.find(
        collection => collection.name === collectionName,
      );

      // Move dashboard
      cy.request("PUT", "/api/dashboard/1", { collection_id: id });

      // Create subscription
      cy.request("POST", "/api/pulse", {
        name: "Orders in a dashboard",
        cards: [
          {
            id: 1,
            collection_id: null,
            description: null,
            display: "table",
            name: "Orders",
            include_csv: false,
            include_xls: false,
            dashboard_card_id: 1,
            dashboard_id: 1,
            parameter_mappings: [],
          },
        ],
        channels: [
          {
            channel_type: "email",
            enabled: true,
            recipients: [
              {
                id: 1,
                email: "admin@metabase.test",
                first_name: "Bobby",
                last_name: "Tables",
                common_name: "Bobby Tables",
              },
            ],
            details: {},
            schedule_type: "monthly",
            schedule_day: "mon",
            schedule_hour: 8,
            schedule_frame: "first",
          },
        ],
        skip_if_empty: false,
        collection_id: id,
        parameters: [],
        dashboard_id: 1,
      });
    },
  );
}
