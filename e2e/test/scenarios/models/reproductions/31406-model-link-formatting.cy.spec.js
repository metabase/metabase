import { modal, popover, restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE_ID } = SAMPLE_DATABASE;

describe.skip("issue 31406", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(
      {
        dataset: true,
        query: {
          "source-table": PEOPLE_ID,
          dataset: true,
          limit: 2,
        },
      },
      { visitQuestion: true },
    );
  });

  it("should persist link text formatting settings for link column (metabase#31406)", () => {
    cy.findByTestId("TableInteractive-root").findByText("Email").click();

    popover().within(() => {
      cy.icon("gear").click();

      cy.findByPlaceholderText("Link to {{bird_id}}")
        .type("Link to {{name}}", {
          parseSpecialCharSequences: false,
        })
        .blur();
    });

    cy.get(".cellData").should("contain", "Link to Hudson Borer");

    cy.findByTestId("qb-header-action-panel").findByText("Save").click();

    modal().within(() => {
      cy.findByTestId("modal-header").should("have.text", "Save model");

      cy.findByText("Save").click();
    });

    modal().within(() => {
      cy.findByText("Saved! Add this to a dashboard?");

      cy.findByText("Not now").click();
    });

    cy.reload();

    // check that "link" formatting is persisted
    cy.get(".cellData").should("contain", "Link to Hudson Borer");
  });
});
