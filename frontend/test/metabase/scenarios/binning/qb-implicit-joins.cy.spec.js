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

      popover().within(() => {
        cy.findByText("Year").click();
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by User → Birth Date: Year");

      // The default chosen "visualization" is table
      cy.findByText("1958");
      cy.findByText("313");
    });

    it("should work for number", () => {
      cy.findByTestId("sidebar-right").within(() => {
        openPopoverFromDefaultBucketSize("Price", "Auto bin");
      });

      popover().within(() => {
        cy.findByText("10 bins").click();
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by Product → Price: 10 bins");
      cy.findByText("196");
    });

    it.skip("should work for longitude", () => {
      cy.findByTestId("sidebar-right").within(() => {
        openPopoverFromDefaultBucketSize("Longitude", "Auto bin");
      });

      popover().within(() => {
        // Test fails at this point (UI inconsistency).
        // It simply gives `10°` as the option, which is different than in any other longitude binning scenario.
        cy.findByText("Bin every 10 degrees").click();
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by User → Longitude: 10°");
      cy.findByText("170° W  –  160° W");
      cy.findByText("75");
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
