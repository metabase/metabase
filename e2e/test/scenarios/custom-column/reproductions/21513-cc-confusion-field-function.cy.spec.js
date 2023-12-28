import {
  restore,
  popover,
  openProductsTable,
  summarize,
  enterCustomColumnDetails,
} from "e2e/support/helpers";

describe("issue 21513", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should handle cc with the same name as an aggregation function (metabase#21513)", () => {
    openProductsTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    popover().findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().findByText("Category").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    enterCustomColumnDetails({
      formula: "[Count] * 2",
      name: "Double Count",
    });
    cy.button("Done").should("not.be.disabled");
  });
});
