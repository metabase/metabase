import {
  restore,
  signInAsAdmin,
  openOrdersTable,
  popover,
  withSampleDataset,
} from "__support__/cypress";

describe("scenarios > question > null", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should display rows whose value is `null` (metabase#13571)", () => {
    withSampleDataset(({ ORDERS }) => {
      cy.request("POST", "/api/card", {
        name: "13571",
        dataset_query: {
          database: 1,
          query: {
            "source-table": 2,
            fields: [["field-id", ORDERS.DISCOUNT]],
            filter: ["=", ["field-id", ORDERS.ID], 1],
          },
          type: "query",
        },
        display: "table",
        visualization_settings: {},
      });

      // find and open previously created question
      cy.visit("/collection/root");
      cy.findByText("13571").click();

      cy.log("**'No Results since at least v0.34.3**");
      cy.findByText("Discount");
      cy.findByText("Empty");
    });
  });

  // [quarantine]
  //  - possible app corruption and new issue with rendering discovered
  //  - see: https://github.com/metabase/metabase/pull/13721#issuecomment-724931075
  //  - test was intermittently failing
  it.skip("pie chart should handle `0`/`null` values (metabase#13626)", () => {
    // Preparation for the test: "Arrange and Act phase" - see repro steps in #13626
    withSampleDataset(({ ORDERS }) => {
      // 1. create a question
      cy.request("POST", "/api/card", {
        name: "13626",
        dataset_query: {
          database: 1,
          query: {
            "source-table": 2,
            aggregation: [["sum", ["expression", "NewDiscount"]]],
            breakout: [["field-id", ORDERS.ID]],
            expressions: {
              NewDiscount: [
                "case",
                [[["=", ["field-id", ORDERS.ID], 2], 0]],
                { default: ["field-id", ORDERS.DISCOUNT] },
              ],
            },
            filter: ["=", ["field-id", ORDERS.ID], 1, 2, 3],
          },
          type: "query",
        },
        display: "pie",
        visualization_settings: {},
      }).then(({ body: { id: questionId } }) => {
        // 2. create a dashboard
        cy.request("POST", "/api/dashboard", {
          name: "13626D",
        }).then(({ body: { id: dashboardId } }) => {
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
                  sizeX: 8,
                  sizeY: 6,
                  parameter_mappings: [
                    {
                      parameter_id: "1f97c149",
                      card_id: questionId,
                      target: ["dimension", ["field-id", ORDERS.ID]],
                    },
                  ],
                },
              ],
            });
          });
          // NOTE: The actual "Assertion" phase begins here
          cy.visit(`/dashboard/${dashboardId}?id=1`);
          cy.findByText("13626D");

          cy.log("**Reported failing in v0.37.0.2**");
          cy.get(".DashCard").within(() => {
            cy.get(".LoadingSpinner").should("not.exist");
            cy.findByText("13626");
            // [quarantine]: flaking in CircleCI, passing locally
            // TODO: figure out the cause of the failed test in CI after #13721 is merged
            // cy.get("svg[class*=PieChart__Donut]");
            // cy.get("[class*=PieChart__Value]").contains("0");
            // cy.get("[class*=PieChart__Title]").contains(/total/i);
          });
        });
      });
    });
  });

  describe("aggregations with null values", () => {
    beforeEach(() => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");
    });

    it("summarize with null values (metabase#12585)", () => {
      openOrdersTable();
      cy.wait("@dataset");
      cy.contains("Summarize").click();
      // remove pre-selected "Count"
      cy.get(".Icon-close").click();
      // dropdown immediately opens with the new set of metrics to choose from
      popover().within(() => {
        cy.findByText("Cumulative sum of ...").click();
        cy.findByText("Discount").click();
      });
      // Group by
      cy.contains("Created At").click();
      cy.contains("Cumulative sum of Discount by Created At: Month");
      cy.wait(["@dataset", "@dataset"]).then(xhrs => {
        expect(xhrs[0].status).to.equal(202);
        expect(xhrs[1].status).to.equal(202);
      });

      cy.findByText("There was a problem with your question").should(
        "not.exist",
      );

      cy.get(".dot").should("have.length.of.at.least", 40);
    });
  });
});
