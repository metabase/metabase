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
        openPopoverFromDefaultBucketSize("People → Birth Date", "by month");
      });

      chooseBucketAndAssert({
        bucketSize: "Year",
        columnType: "time",
        title: "Count by People → Birth Date: Year",
        values: ["1960", "1965", "2000"],
      });

      // Make sure time series footer works as well
      cy.get(".AdminSelect-content")
        .contains("Year")
        .click();
      cy.findByText("Quarter").click();

      cy.wait("@dataset");
      cy.get(".axis.x").within(() => {
        cy.findByText("Q1 - 1960");
        cy.findByText("Q1 - 1965");
        cy.findByText("Q1 - 2000");
      });
    });

    it("should work for number", () => {
      cy.findByTestId("sidebar-right").within(() => {
        openPopoverFromDefaultBucketSize("Products → Price", "Auto bin");
      });

      chooseBucketAndAssert({
        bucketSize: "50 bins",
        title: "Count by Products → Price: 50 bins",
        values: ["14", "18", "20", "100"],
      });
    });

    it("should work for longitude", () => {
      cy.findByTestId("sidebar-right").within(() => {
        openPopoverFromDefaultBucketSize("People → Longitude", "Auto bin");
      });

      chooseBucketAndAssert({
        bucketSize: "Bin every 20 degrees",
        title: "Count by People → Longitude: 20°",
        values: ["180° W", "160° W", "60° W"],
      });
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
        openPopoverFromDefaultBucketSize("People → Birth Date", "by month");
      });

      chooseBucketAndAssert({
        bucketSize: "Year",
        columnType: "time",
        mode: "notebook",
        title: "Count by People → Birth Date: Year",
        values: ["1960", "1965", "2000"],
      });

      // Make sure time series footer works as well
      cy.get(".AdminSelect-content")
        .contains("Year")
        .click();
      cy.findByText("Quarter").click();

      cy.wait("@dataset");
      cy.get(".axis.x").within(() => {
        cy.findByText("Q1 - 1960");
        cy.findByText("Q1 - 1965");
        cy.findByText("Q1 - 2000");
      });
    });

    it("should work for number", () => {
      popover().within(() => {
        openPopoverFromDefaultBucketSize("Products → Price", "Auto bin");
      });

      chooseBucketAndAssert({
        bucketSize: "50 bins",
        mode: "notebook",
        title: "Count by Products → Price: 50 bins",
        values: ["14", "18", "20", "100"],
      });
    });

    it("should work for longitude", () => {
      popover().within(() => {
        openPopoverFromDefaultBucketSize("People → Longitude", "Auto bin");
      });

      chooseBucketAndAssert({
        bucketSize: "Bin every 20 degrees",
        mode: "notebook",
        title: "Count by People → Longitude: 20°",
        values: ["180° W", "160° W", "60° W"],
      });
    });
  });

  context("via column popover", () => {
    beforeEach(() => {
      cy.visit("/question/new");
      cy.findByText("Simple question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("QB Binning").click();
    });

    /**
     * Generated title seems to be incorrect.
     * Please see: https://github.com/metabase/metabase/issues/16693.
     *
     *  1. Todo: unskip the titles in this block once #16693 gets fixed.
     *  2. Unskip the repro for metabase#16693 which was conviniently created in this same file.
     *
     * Note: after #16693 gets fixed, it might even make sense to completly remove the related repro,
     * since all other tests within this `context` will already cover that implicitly and will guard against a regression.
     */

    it.skip("should render the correct title (metabase#16693)", () => {
      cy.findByText("People → Birth Date").click();
      cy.findByText("Distribution").click();

      cy.findByText("Count by People → Birth Date: Month");
    });

    it("should work for time series", () => {
      cy.findByText("People → Birth Date").click();
      cy.findByText("Distribution").click();

      /**
       * Please see the comment no. 1 above.
       */
      // cy.findByText("Count by People → Birth Date: Month");

      assertOnXYAxisLabels({ xLabel: "People → Birth Date", yLabel: "Count" });

      cy.findByText("January, 1960");
      cy.findByText("January, 1965");

      cy.get("circle");

      // Make sure time series footer works as well
      cy.get(".AdminSelect-content")
        .contains("Month")
        .click();
      cy.findByText("Quarter").click();

      /**
       * Please see the comment no. 1 above.
       */
      // cy.findByText("Count by People → Birth Date: Quarter");

      cy.findByText("Q1 - 1960");
      cy.findByText("Q1 - 1965");
    });

    it("should work for number", () => {
      cy.findByText("Products → Price").click();
      cy.findByText("Distribution").click();

      /**
       * Please see the comment no. 1 above.
       */
      // cy.findByText("Count by Products → Price: Auto binned");

      assertOnXYAxisLabels({ xLabel: "Products → Price", yLabel: "Count" });

      cy.findByText("12.5");
      cy.findByText("25");

      cy.get(".bar");
    });

    it("should work for longitude", () => {
      cy.findByText("People → Longitude").click();
      cy.findByText("Distribution").click();

      /**
       * Please see the comment no. 1 above.
       */
      // cy.findByText("Count by People → Longitude: Auto binned");

      assertOnXYAxisLabels({
        xLabel: "People → Longitude",
        yLabel: "Count",
      });

      cy.findByText("170° W");
      cy.findByText("160° W");

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

function chooseBucketAndAssert({
  bucketSize,
  columnType,
  title,
  mode = null,
  values,
} = {}) {
  popover()
    .last()
    .within(() => {
      cy.findByText(bucketSize).click();
    });

  if (mode === "notebook") {
    cy.button("Visualize").click();
  }

  waitAndAssertOnRequest("@dataset");

  const visualizaitonSelector = columnType === "time" ? "circle" : ".bar";
  cy.get(visualizaitonSelector);

  cy.findByText(title);

  values &&
    cy.get(".axis.x").within(() => {
      values.forEach(value => {
        cy.findByText(value);
      });
    });
}
