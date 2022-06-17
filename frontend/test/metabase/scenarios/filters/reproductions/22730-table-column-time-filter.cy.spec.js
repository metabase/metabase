import { restore, popover } from "__support__/e2e/cypress";

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
    cy.findByText("Explore results").click();
    cy.findByText("time").click();

    popover().within(() => {
      cy.findByText("Filter by this column").click();

      cy.findByTestId("hours-input")
        .clear()
        .type("14");
      cy.findByTestId("minutes-input")
        .clear()
        .type("03");

      cy.button("Add filter").click();
    });

    cy.findByText("before-row");
    cy.findByText("after-row").should("not.exist");
  });
});
