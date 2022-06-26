import { restore, summarize, sidebar } from "__support__/e2e/helpers";
import { openDetailsSidebar } from "../helpers/e2e-models-helpers";

describe.skip("issue 22518", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(
      {
        native: {
          query: "select 1 id, 'a' foo",
        },
        dataset: true,
      },
      { visitQuestion: true },
    );
  });

  it("UI should immediately reflect model query changes upon saving (metabase#22518)", () => {
    openDetailsSidebar();
    cy.findByText("Edit query definition").click();

    cy.get(".ace_content").type(", 'b' bar");

    cy.findByText("Save changes").click();

    cy.findAllByTestId("header-cell")
      .should("have.length", 3)
      .and("contain", "BAR");

    summarize();

    sidebar()
      .should("contain", "ID")
      .and("contain", "FOO")
      .and("contain", "BAR");
  });
});
