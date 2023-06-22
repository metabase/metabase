import { restore, popover } from "e2e/support/helpers";

describe("issue 22730", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(
      {
        name: "22730",
        native: {
          query: `select '14:02:13'::time "time", 'before-row' "name" union all select '14:06:13'::time "time", 'after-row' `,
        },
      },
      { visitQuestion: true },
    );

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("allows filtering by time column (metabase#22730)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Explore results").click();
    cy.wait("@dataset");

    cy.findAllByTestId("header-cell")
      .contains("time")
      .should("be.visible")
      .click();

    popover().within(() => {
      cy.findByText("Filter by this column").click();

      cy.findByTestId("hours-input").clear().type("14").blur();

      cy.findByTestId("minutes-input").clear().type("03").blur();

      cy.button("Add filter").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("before-row");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("after-row").should("not.exist");
  });
});
