import { restore, popover } from "__support__/e2e/cypress";

describe("scenarios > binning > from a saved sql question", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createNativeQuestion({
      name: "SQL Binning",
      native: {
        query:
          "SELECT ORDERS.CREATED_AT, ORDERS.TOTAL, PEOPLE.LONGITUDE FROM ORDERS JOIN PEOPLE ON orders.user_id = people.id",
      },
    });

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  context("via simple question", () => {
    beforeEach(() => {
      cy.visit("/question/new");
      cy.findByText("Simple question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("SQL Binning").click();
      cy.findByText("Summarize").click();
      cy.wait("@dataset");
    });

    it.skip("should work for time series", () => {
      cy.findByTestId("sidebar-right").within(() => {
        /*
         * This basic/default bucket size seems wrong.
         * For every other scenario, the default bucket for time series is "by month".
         *
         * TODO: update to "by month" once (metabase#16671) gets fixed.
         */
        openPopoverFromDefaultBucketSize("CREATED_AT", "by minute");
      });

      popover().within(() => {
        cy.findByText("Year").click();
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by CREATED_AT: Year");
      cy.get("circle");
    });

    it("should work for number", () => {
      cy.findByTestId("sidebar-right").within(() => {
        openPopoverFromDefaultBucketSize("TOTAL", "Auto binned");
      });

      popover().within(() => {
        cy.findByText("100 bins").click();
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by TOTAL: 100 bins");
      cy.get(".bar");
    });

    it.skip("should work for longitude", () => {
      cy.findByTestId("sidebar-right").within(() => {
        openPopoverFromDefaultBucketSize("LONGITUDE", "Auto binned");
      });

      popover().within(() => {
        cy.findByText("Bin every 10 degrees").click();
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by LONGITUDE: 10°");
      cy.get(".bar");
    });
  });

  context.skip("via custom question", () => {
    beforeEach(() => {
      cy.visit("/question/new");
      cy.findByText("Custom question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("SQL Binning").click();

      cy.findByText("Summarize").click();
      cy.findByText("Pick the metric you want to see").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();
    });

    it("should work for time series", () => {
      popover().within(() => {
        openPopoverFromDefaultBucketSize("CREATED_AT", "by minute");
      });
      cy.findByText("Year").click();

      cy.findByText("Count by CREATED_AT: Year");
      cy.button("Visualize").click();

      waitAndAssertOnRequest("@dataset");
      cy.get("circle");
    });

    it("should work for number", () => {
      popover().within(() => {
        openPopoverFromDefaultBucketSize("TOTAL", "Auto binned");
      });
      cy.findByText("100 bins").click();

      cy.findByText("Count by TOTAL: 100 bins");
      cy.button("Visualize").click();

      waitAndAssertOnRequest("@dataset");
      cy.get(".bar");
    });

    it("should work for longitude", () => {
      popover().within(() => {
        openPopoverFromDefaultBucketSize("LONGITUDE", "Auto binned");
      });
      cy.findByText("Bin every 10 degrees").click();

      cy.findByText("Count by LONGITUDE: 10°");
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
      cy.findByText("SQL Binning").click();
    });

    it("should work for time series", () => {
      cy.findByText("CREATED_AT").click();
      cy.findByText("Distribution").click();

      assertOnXYAxisLabels({ xLabel: "CREATED_AT", yLabel: "Count" });
      cy.findByText("Count by CREATED_AT: Month");
      cy.get("circle");

      // Open a popover with bucket options from the time series footer
      cy.get(".AdminSelect-content")
        .contains("Month")
        .click();
      cy.findByText("Quarter").click();

      cy.findByText("Count by CREATED_AT: Quarter");
      cy.findByText("Q1 - 2017");
    });

    it("should work for number (metabase##16670)", () => {
      cy.findByText("TOTAL").click();
      cy.findByText("Distribution").click();

      assertOnXYAxisLabels({ xLabel: "TOTAL", yLabel: "Count" });
      cy.findByText("Count by TOTAL: Auto binned");
      /*
       * Auto binning result is much more granular than it is for QB Questions.
       * Please, see https://github.com/metabase/metabase/issues/16670
       *
       * However, this is not the scope of this particular test.
       * The explicit repro will be added later in the separate file.
       */
      cy.get(".bar");
    });

    it.skip("should work for longitude (metabase#16672)", () => {
      cy.findByText("LONGITUDE").click();
      cy.findByText("Distribution").click();

      assertOnXYAxisLabels({ xLabel: "LONGITUDE", yLabel: "Count" });
      cy.findByText("Count by LONGITUDE: Auto binned");
      cy.get(".bar");
      cy.findByText("170° W");
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
