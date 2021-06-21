import { restore, popover } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const {
  ORDERS_ID,
  ORDERS,
  PEOPLE_ID,
  PEOPLE,
  PRODUCTS_ID,
  PRODUCTS,
} = SAMPLE_DATASET;

describe("scenarios > binning > from a saved QB question with explicit joins", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createQuestion({
      name: "QB Binning",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: [
              ["field", PEOPLE.LONGITUDE, { "join-alias": "People" }],
              [
                "field",
                PEOPLE.BIRTH_DATE,
                { "temporal-unit": "default", "join-alias": "People" },
              ],
            ],
            "source-table": PEOPLE_ID,
            condition: [
              "=",
              ["field", ORDERS.USER_ID, null],
              ["field", PEOPLE.ID, { "join-alias": "People" }],
            ],
            alias: "People",
          },
          {
            fields: [["field", PRODUCTS.PRICE, { "join-alias": "Products" }]],
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
        fields: [["field", ORDERS.ID, null]],
      },
    });

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  context("via simple question", () => {
    beforeEach(() => {
      cy.visit("/question/new");
      cy.findByText("Simple question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("QB Binning").click();
      cy.findByText("Summarize").click();
      cy.wait("@dataset");
    });

    it("should work for time series", () => {
      cy.findByTestId("sidebar-right").within(() => {
        // This basic/default bucket seems wrong.
        // For every other scenario, the default bucker for time is "by month"
        openPopoverFromDefaultBucketSize("Created At", "by month");
      });

      popover().within(() => {
        cy.findByText("Year").click();
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by Created At: Year");
      cy.get("circle");
    });

    it("should work for number", () => {
      cy.findByTestId("sidebar-right").within(() => {
        openPopoverFromDefaultBucketSize("Total", "Auto bin");
      });

      popover().within(() => {
        cy.findByText("100 bins").click();
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by Total: 100 bins");
      cy.get(".bar");
    });

    it("should work for longitude", () => {
      cy.findByTestId("sidebar-right").within(() => {
        openPopoverFromDefaultBucketSize(
          "People - User → Longitude",
          "Auto bin",
        );
      });

      popover().within(() => {
        cy.findByText("Bin every 10 degrees").click();
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by People - User → Longitude: 10°");
      cy.get(".bar");
    });
  });

  context("via custom question", () => {
    beforeEach(() => {
      cy.visit("/question/new");
      cy.findByText("Custom question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("QB Binning").click();

      cy.findByText("Summarize").click();
      cy.findByText("Pick the metric you want to see").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();
    });

    it("should work for time series", () => {
      popover().within(() => {
        openPopoverFromDefaultBucketSize("Created At", "by month");
      });
      cy.findByText("Year").click();

      cy.findByText("Count by Created At: Year");
      cy.button("Visualize").click();

      waitAndAssertOnRequest("@dataset");
      cy.get("circle");
    });

    it("should work for number", () => {
      popover().within(() => {
        openPopoverFromDefaultBucketSize("Total", "Auto bin");
      });
      cy.findByText("100 bins").click();

      cy.findByText("Count by Total: 100 bins");
      cy.button("Visualize").click();

      waitAndAssertOnRequest("@dataset");
      cy.get(".bar");
    });

    it("should work for longitude", () => {
      popover().within(() => {
        openPopoverFromDefaultBucketSize(
          "People - User → Longitude",
          "Auto bin",
        );
      });
      cy.findByText("Bin every 10 degrees").click();

      cy.findByText("Count by People - User → Longitude: 10°");
      cy.button("Visualize").click();

      waitAndAssertOnRequest("@dataset");
      cy.get(".bar");
    });
  });

  context("via column popover", () => {
    beforeEach(() => {
      cy.visit("/question/new");
      cy.findByText("Simple question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("QB Binning").click();
    });

    it("should work for time series", () => {
      cy.findByText("Created At").click();
      cy.findByText("Distribution").click();

      assertOnXYAxisLabels({ xLabel: "Created At", yLabel: "Count" });
      cy.findByText("Count by Created At: Month");
      cy.get("circle");

      // Open a popover with bucket options from the time series footer
      cy.get(".AdminSelect-content")
        .contains("Month")
        .click();
      cy.findByText("Quarter").click();

      cy.findByText("Count by Created At: Quarter");
      cy.findByText("Q1 - 2017");
    });

    it("should work for number", () => {
      cy.findByText("Total").click();
      cy.findByText("Distribution").click();

      assertOnXYAxisLabels({ xLabel: "Total", yLabel: "Count" });
      cy.findByText("Count by Total: Auto binned");
      // Auto bin is much more granular than it is for QB questions
      cy.get(".bar");
    });

    it.skip("should work for longitude", () => {
      cy.findByText("People - User → Longitude").click();
      cy.findByText("Distribution").click();

      assertOnXYAxisLabels({
        xLabel: "People - User → Longitude",
        yLabel: "Count",
      });
      cy.findByText("Count by People - User → Longitude: Auto binned");
      // Auto bin is much more granular than it is for QB questions
      cy.get(".bar");
    });
  });
});

function openPopoverFromDefaultBucketSize(column, bucket) {
  cy.findByText(column)
    .closest(".List-item")
    .should("be.visible")
    .as("targetListItem");

  cy.get("@targetListItem")
    .find(".Field-extra")
    .as("listItemSelectedBinning")
    .should("contain", bucket)
    .click();
}

function assertOnXYAxisLabels({ xLabel, yLabel } = {}) {
  cy.get(".x-axis-label")
    .invoke("text")
    .should("eq", xLabel);

  cy.get(".y-axis-label")
    .invoke("text")
    .should("eq", yLabel);
}

function waitAndAssertOnRequest(requestAlias) {
  cy.wait(requestAlias).then(xhr => {
    expect(xhr.response.body.error).to.not.exist;
  });
}
