import { restore, popover } from "__support__/e2e/cypress";

describe("scenarios > binning > from a saved QB question using implicit joins", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  context("via simple question", () => {
    beforeEach(() => {
      cy.visit("/question/1");
      cy.findByText("Summarize").click();
    });

    it("should work for time series", () => {
      cy.findByTestId("sidebar-right").within(() => {
        openPopoverFromDefaultBucketSize("Birth Date", "by month");
      });

      chooseBucketAndAssert({
        bucketSize: "Year",
        title: "Count by User → Birth Date: Year",
        values: ["1958", "313"],
      });

      // Make sure time series chooseBucketAndAssertter works as well
      cy.get(".AdminSelect-content")
        .contains("Year")
        .click();
      cy.findByText("Month").click();

      cy.get(".cellData")
        .should("contain", "April, 1958")
        .and("contain", "37");
    });

    it("should work for number", () => {
      cy.findByTestId("sidebar-right").within(() => {
        openPopoverFromDefaultBucketSize("Price", "Auto bin");
      });

      chooseBucketAndAssert({
        bucketSize: "50 bins",
        title: "Count by Product → Price: 50 bins",
        values: ["14  –  16", "96"],
      });
    });

    it("should work for longitude", () => {
      cy.findByTestId("sidebar-right").within(() => {
        openPopoverFromDefaultBucketSize("Longitude", "Auto bin");
      });

      chooseBucketAndAssert({
        // Test is currently incorrect in that it displays wrong binning options (please see: https://github.com/metabase/metabase/issues/16674)
        // Once #16674 gets fixed, update the following line to say: `bucketSize: "Bin every 20 degrees"`
        bucketSize: "20°",
        title: "Count by User → Longitude: 20°",
        values: ["180° W  –  160° W", "75"],
      });
    });
  });

  context("via custom question", () => {
    beforeEach(() => {
      cy.visit("/question/1/notebook");
      cy.findByText("Summarize").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();
      // Click "Order" accordion to collapse it and expose the other tables
      cy.findByText("Order").click();
    });

    it("should work for time series", () => {
      cy.findByText("User").click();
      cy.findByPlaceholderText("Find...").type("birth");
      openPopoverFromDefaultBucketSize("Birth Date", "by month");

      chooseBucketAndAssert({
        bucketSize: "Year",
        title: "Count by User → Birth Date: Year",
        mode: "notebook",
        values: ["1958", "313"],
      });

      // Make sure time series chooseBucketAndAssertter works as well
      cy.get(".AdminSelect-content")
        .contains("Year")
        .click();
      cy.findByText("Month").click();

      cy.get(".cellData")
        .should("contain", "April, 1958")
        .and("contain", "37");
    });

    it("should work for number", () => {
      cy.findByText("Product").click();

      openPopoverFromDefaultBucketSize("Price", "Auto bin");

      chooseBucketAndAssert({
        bucketSize: "50 bins",
        title: "Count by Product → Price: 50 bins",
        mode: "notebook",
        values: ["14  –  16", "96"],
      });
    });

    it("should work for longitude", () => {
      cy.findByText("User").click();
      cy.findByPlaceholderText("Find...").type("longitude");

      openPopoverFromDefaultBucketSize("Longitude", "Auto bin");

      chooseBucketAndAssert({
        // Test is currently incorrect in that it displays wrong binning options (please see: https://github.com/metabase/metabase/issues/16674)
        // Once #16674 gets fixed, update the following line to say: `bucketSize: "Bin every 20 degrees"`
        bucketSize: "20°",
        title: "Count by User → Longitude: 20°",
        mode: "notebook",
        values: ["180° W  –  160° W", "75"],
      });
    });
  });
});

function openPopoverFromDefaultBucketSize(column, bucket) {
  cy.findByText(column)
    .closest(".List-item")
    .as("targetListItem");

  cy.get("@targetListItem")
    .find(".Field-extra")
    .as("listItemSelectedBinning")
    .should("contain", bucket)
    .click();
}

function waitAndAssertOnRequest(requestAlias) {
  cy.wait(requestAlias).then(xhr => {
    expect(xhr.response.body.error).to.not.exist;
  });
}

function chooseBucketAndAssert({
  bucketSize,
  title,
  mode = null,
  values,
} = {}) {
  const [firstValue, lastValue] = values;

  popover()
    .last()
    .within(() => {
      cy.findByText(bucketSize).click();
    });

  if (mode === "notebook") {
    cy.button("Visualize").click();
  }
  waitAndAssertOnRequest("@dataset");

  cy.findByText(title);
  cy.get(".cellData")
    .should("contain", firstValue)
    .and("contain", lastValue);
}
