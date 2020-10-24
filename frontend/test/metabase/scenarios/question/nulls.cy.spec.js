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

  it.skip("should display rows whose value is `null` (metabase#13571)", () => {
    withSampleDataset(({ ORDERS }) => {
      cy.request("POST", "/api/card", {
        name: "13571",
        dataset_query: {
          database: 1,
          query: {
            "source-table": 2,
            fields: [ORDERS.DISCOUNT],
            filter: ["=", ORDERS.ID, 1],
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
      cy.findByText("No results!").should("not.exist");
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
