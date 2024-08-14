import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  openOrdersTable,
  popover,
  summarize,
  visitDashboard,
  rightSidebar,
  updateDashboardCards,
  addOrUpdateDashboardCard,
  cartesianChartCircle,
} from "e2e/support/helpers";

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
    cy.findByTestId("detail-shortcut").click();
    cy.findByRole("dialog").within(() => {
      cy.findByText(/Discount/i);
      cy.findByText("Empty");
    });
  });

  it("pie chart should handle `0`/`null` values (metabase#13626)", () => {
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
    }).then(({ body: { card_id, dashboard_id } }) => {
      addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: {
          size_x: 12,
          size_y: 8,
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
      cy.findByDisplayValue("13626D");

      cy.log("Reported failing in v0.37.0.2");
      cy.findByTestId("dashcard-container").within(() => {
        cy.findByTestId("loading-indicator").should("not.exist");
        cy.findByTestId("legend-caption-title").should("have.text", "13626");
        cy.findByText("TOTAL").should("be.visible");
        cy.findByText("0").should("be.visible");
        cy.findAllByTestId("legend-item").contains("1").should("be.visible");
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
              { card_id: Q1_ID, row: 0, col: 0, size_x: 8, size_y: 4 },
              { card_id: Q2_ID, row: 0, col: 6, size_x: 8, size_y: 4 },
            ],
          });

          visitDashboard(DASHBOARD_ID);
          cy.log("P0 regression in v0.37.1!");
          cy.findByTestId("loading-indicator").should("not.exist");
          cy.findByText("13801_Q1");
          cy.findAllByTestId("scalar-value").should("contain", "0");
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
      .closest(".test-TableInteractive-cellWrapper")
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

      cartesianChartCircle().should("have.length.of.at.least", 40);
    });
  });
});
