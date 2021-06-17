import { restore, popover } from "__support__/e2e/cypress";

describe("scenarios > binning > from a saved sql question", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createNativeQuestion({
      name: "SQL Binning",
      native: {
        query:
          "SELECT ORDERS.CREATED_AT, ORDERS.TOTAL, PEOPLE.BIRTH_DATE, PEOPLE.LONGITUDE FROM ORDERS JOIN PEOPLE ON orders.user_id = people.id",
      },
    });

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  context.skip("via simple question", () => {
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
        // This basic/default bucket seems wrong.
        // For every other scenario, the default bucker for time is "by month"
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

    it("should work for longitude", () => {
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
      cy.get(".bar");
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

function waitAndAssertOnRequest(requestAlias) {
  cy.wait(requestAlias).then(xhr => {
    expect(xhr.response.body.error).to.not.exist;
  });
}
