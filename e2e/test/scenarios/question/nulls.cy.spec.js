import {
  restore,
  openOrdersTable,
  popover,
  summarize,
  visitDashboard,
  rightSidebar,
  updateDashboardCards,
  addOrUpdateDashboardCard,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > null", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display rows whose value is `null` (metabase#13571)", () => {
    cy.createQuestion({
      name: "13571",
      query: {
        "source-table": ORDERS_ID,
        fields: [
          ["field", ORDERS.ID, null],
          ["field", ORDERS.DISCOUNT, null],
        ],
        filter: ["=", ["field", ORDERS.ID, null], 1],
      },
    });

    // find and open previously created question
    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("13571").click();

    cy.log("'No Results since at least v0.34.3");
    cy.get("#detail-shortcut").click();
    cy.findByRole("dialog").within(() => {
      cy.findByText(/Discount/i);
      cy.findByText("Empty");
    });
  });

  // [quarantine]
  //  - possible app corruption and new issue with rendering discovered
  //  - see: https://github.com/metabase/metabase/pull/13721#issuecomment-724931075
  //  - test was intermittently failing
  it.skip("pie chart should handle `0`/`null` values (metabase#13626)", () => {
    // Preparation for the test: "Arrange and Act phase" - see repro steps in #13626

    cy.createQuestionAndDashboard({
      questionDetails: {
        name: "13626",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["expression", "NewDiscount"]]],
          breakout: [["field", ORDERS.ID, null]],
          expressions: {
            NewDiscount: [
              "case",
              [[["=", ["field", ORDERS.ID, null], 2], 0]],
              { default: ["field", ORDERS.DISCOUNT, null] },
            ],
          },
          filter: ["=", ["field", ORDERS.ID, null], 1, 2, 3],
        },
        display: "pie",
      },
      dashboardDetails: {
        name: "13626D",
        parameters: [
          {
            id: "1f97c149",
            name: "ID",
            slug: "id",
            type: "id",
          },
        ],
      },
      cardDetails: {
        size_x: 8,
        size_y: 6,
      },
    }).then(({ body: { card_id, dashboard_id } }) => {
      addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: {
          parameter_mappings: [
            {
              parameter_id: "1f97c149",
              card_id,
              target: ["dimension", ["field", ORDERS.ID, null]],
            },
          ],
        },
      });

      // NOTE: The actual "Assertion" phase begins here
      cy.visit(`/dashboard/${dashboard_id}?id=1`);
      cy.findByText("13626D");

      cy.log("Reported failing in v0.37.0.2");
      cy.get(".DashCard").within(() => {
        cy.findByTestId("loading-spinner").should("not.exist");
        cy.findByText("13626");
        // [quarantine]: flaking in CircleCI, passing locally
        // TODO: figure out the cause of the failed test in CI after #13721 is merged
        // cy.get("svg[class*=PieChart__Donut]");
        // cy.get("[class*=PieChart__Value]").contains("0");
        // cy.get("[class*=PieChart__Title]").contains(/total/i);
      });
    });
  });

  it("dashboard should handle cards with null values (metabase#13801)", () => {
    cy.createNativeQuestion({
      name: "13801_Q1",
      native: { query: "SELECT null", "template-tags": {} },
      display: "scalar",
    }).then(({ body: { id: Q1_ID } }) => {
      cy.createNativeQuestion({
        name: "13801_Q2",
        native: { query: "SELECT 0", "template-tags": {} },
        display: "scalar",
      }).then(({ body: { id: Q2_ID } }) => {
        cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
          cy.log("Add both previously created questions to the dashboard");

          updateDashboardCards({
            dashboard_id: DASHBOARD_ID,
            cards: [
              { card_id: Q1_ID, row: 0, col: 0, size_x: 6, size_y: 4 },
              { card_id: Q2_ID, row: 0, col: 6, size_x: 6, size_y: 4 },
            ],
          });

          visitDashboard(DASHBOARD_ID);
          cy.log("P0 regression in v0.37.1!");
          cy.findByTestId("loading-spinner").should("not.exist");
          cy.findByText("13801_Q1");
          cy.get(".ScalarValue").should("contain", "0");
          cy.findByText("13801_Q2");
        });
      });
    });
  });

  it("should filter by clicking on the row with `null` value (metabase#18386)", () => {
    openOrdersTable();

    // Total of "39.72", and the next cell is the `discount` (which is empty)
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("39.72")
      .closest(".TableInteractive-cellWrapper")
      .next()
      .find("div")
      .should("be.empty")
      // Open the context menu that lets us apply filter using this column directly
      .click({ force: true });

    popover().contains("=").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("39.72");
    // This row ([id] 3) had the `discount` column value and should be filtered out now
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("49.21").should("not.exist");
  });

  describe("aggregations with null values", () => {
    it("summarize with null values (metabase#12585)", () => {
      openOrdersTable();

      summarize();
      rightSidebar().within(() => {
        // remove pre-selected "Count"
        cy.icon("close").click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add a metric").click();
      // dropdown immediately opens with the new set of metrics to choose from
      popover().within(() => {
        cy.findByText("Cumulative sum of ...").click();
        cy.findByText("Discount").click();
      });
      // Group by
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Created At").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Cumulative sum of Discount by Created At: Month");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("There was a problem with your question").should(
        "not.exist",
      );

      cy.get(".dot").should("have.length.of.at.least", 40);
    });
  });
});
