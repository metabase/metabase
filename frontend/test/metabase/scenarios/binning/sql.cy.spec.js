import { restore, popover } from "__support__/e2e/cypress";

describe("scenarios > binning > from a saved sql question", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
    cy.createNativeQuestion({
      name: "SQL Binning",
      native: {
        query:
          "SELECT ORDERS.CREATED_AT, ORDERS.TOTAL, PEOPLE.LONGITUDE FROM ORDERS JOIN PEOPLE ON orders.user_id = people.id",
      },
    }).then(({ body }) => {
      /**
       * We need to visit the question and to wait for the result metadata to load first.
       * Please see: https://github.com/metabase/metabase/pull/16707#issuecomment-866126310
       */
      cy.visit(`/question/${body.id}`);
      cy.wait("@cardQuery");
    });
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

    it("should work for time series", () => {
      cy.findByTestId("sidebar-right").within(() => {
        /*
         * If `result_metadata` is not loaded (SQL question is not run before saving),
         * the granularity is much finer and one can see "by minute" as the default bucket (metabase#16671).
         */
        openPopoverFromDefaultBucketSize("CREATED_AT", "by month");
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
        cy.findByText("50 bins").click();
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by TOTAL: 50 bins");
      cy.get(".bar");
    });

    it("should work for longitude", () => {
      cy.findByTestId("sidebar-right").within(() => {
        openPopoverFromDefaultBucketSize("LONGITUDE", "Auto binned");
      });

      popover().within(() => {
        /**
         * The correct option should say "Bin every 10 degrees", but this is out of the scope of this test.
         * It was covered in `frontend/test/metabase/scenarios/binning/binning-options.cy.spec.js`
         * Please see: https://github.com/metabase/metabase/issues/16675.
         *
         * TODO: Change back to "Bin every 10 degrees" once metabase#16675 gets fixed.
         */
        cy.findByText("10°").click();
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by LONGITUDE: 10°");
      cy.get(".bar");
    });
  });

  context("via custom question", () => {
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
        openPopoverFromDefaultBucketSize("CREATED_AT", "by month");
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
      cy.findByText("50 bins").click();

      cy.findByText("Count by TOTAL: 50 bins");
      cy.button("Visualize").click();

      waitAndAssertOnRequest("@dataset");
      cy.get(".bar");
    });

    it("should work for longitude", () => {
      popover().within(() => {
        openPopoverFromDefaultBucketSize("LONGITUDE", "Auto binned");
      });
      /**
       * The correct option should say "Bin every 10 degrees", but this is out of the scope of this test.
       * It was covered in `frontend/test/metabase/scenarios/binning/binning-options.cy.spec.js`
       * Please see: https://github.com/metabase/metabase/issues/16675
       *
       * TODO: Change back to "Bin every 10 degrees" once metabase#16675 gets fixed.
       */
      cy.findByText("10°").click();

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

    it("should work for number", () => {
      cy.findByText("TOTAL").click();
      cy.findByText("Distribution").click();

      assertOnXYAxisLabels({ xLabel: "TOTAL", yLabel: "Count" });
      cy.findByText("Count by TOTAL: Auto binned");
      cy.get(".bar");
    });

    it("should work for longitude", () => {
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
