import {
  restore,
  openOrdersTable,
  popover,
  sidebar,
  summarize,
  visitDashboard,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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
    cy.findByText("13571").click();

    cy.log("'No Results since at least v0.34.3");
    cy.get("#detail-shortcut").click();
    cy.findByText("Discount");
    cy.findByText("Empty");
  });

  // [quarantine]
  //  - possible app corruption and new issue with rendering discovered
  //  - see: https://github.com/metabase/metabase/pull/13721#issuecomment-724931075
  //  - test was intermittently failing
  it.skip("pie chart should handle `0`/`null` values (metabase#13626)", () => {
    // Preparation for the test: "Arrange and Act phase" - see repro steps in #13626

    cy.createQuestion({
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
    }).then(({ body: { id: questionId } }) => {
      cy.createDashboard({ name: "13626D" }).then(
        ({ body: { id: dashboardId } }) => {
          // add filter (ID) to the dashboard
          cy.request("PUT", `/api/dashboard/${dashboardId}`, {
            parameters: [
              {
                id: "1f97c149",
                name: "ID",
                slug: "id",
                type: "id",
              },
            ],
          });

          // add previously created question to the dashboard
          cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
            cardId: questionId,
          }).then(({ body: { id: dashCardId } }) => {
            // connect filter to that question
            cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
              cards: [
                {
                  id: dashCardId,
                  card_id: questionId,
                  row: 0,
                  col: 0,
                  size_x: 8,
                  size_y: 6,
                  parameter_mappings: [
                    {
                      parameter_id: "1f97c149",
                      card_id: questionId,
                      target: ["dimension", ["field", ORDERS.ID, null]],
                    },
                  ],
                },
              ],
            });
          });
          // NOTE: The actual "Assertion" phase begins here
          cy.visit(`/dashboard/${dashboardId}?id=1`);
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
        },
      );
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

          [Q1_ID, Q2_ID].forEach((questionId, index) => {
            cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
              cardId: questionId,
            }).then(({ body: { id: DASHCARD_ID } }) => {
              const CARD_SIZE_X = 6;

              cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
                cards: [
                  {
                    id: DASHCARD_ID,
                    card_id: questionId,
                    row: 0,
                    col: index === 0 ? 0 : CARD_SIZE_X, // making sure the second card doesn't overlap the first one
                    size_x: CARD_SIZE_X,
                    size_y: 4,
                    parameter_mappings: [],
                  },
                ],
              });
            });
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
    cy.findByText("39.72")
      .closest(".TableInteractive-cellWrapper")
      .next()
      .find("div")
      .should("be.empty")
      // Open the context menu that lets us apply filter using this column directly
      .click({ force: true });

    popover().contains("=").click();

    cy.findByText("39.72");
    // This row ([id] 3) had the `discount` column value and should be filtered out now
    cy.findByText("49.21").should("not.exist");
  });

  describe("aggregations with null values", () => {
    it("summarize with null values (metabase#12585)", () => {
      openOrdersTable();

      summarize();
      sidebar().within(() => {
        // remove pre-selected "Count"
        cy.icon("close").click();
      });
      cy.findByText("Add a metric").click();
      // dropdown immediately opens with the new set of metrics to choose from
      popover().within(() => {
        cy.findByText("Cumulative sum of ...").click();
        cy.findByText("Discount").click();
      });
      // Group by
      cy.contains("Created At").click();
      cy.contains("Cumulative sum of Discount by Created At: Month");

      cy.findByText("There was a problem with your question").should(
        "not.exist",
      );

      cy.get(".dot").should("have.length.of.at.least", 40);
    });
  });
});
