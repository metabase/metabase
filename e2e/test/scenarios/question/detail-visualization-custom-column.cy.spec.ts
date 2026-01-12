import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > detail visualization + custom column preview", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should render a newly added custom column when previewing Detail visualization (metabase#63181)", () => {
    const CUSTOM_COLUMN_NAME = "Tax custom column";

    // Create a simple question and set visualization to "Detail" (Object Detail)
    H.createQuestion(
      {
        name: "Detail viz with custom column (preview)",
        query: { "source-table": ORDERS_ID },
        display: "object",
      },
      { visitQuestion: true },
    );

    // Go to notebook editor and add a simple custom column
    H.openNotebook();
    H.addCustomColumn();
    H.enterCustomColumnDetails({ formula: "[Tax]", name: CUSTOM_COLUMN_NAME });
    cy.button("Done").click();

    // Click Visualize without saving the question
    cy.button("Visualize").click();

    // Ensure the Detail visualization renders
    cy.findByTestId("object-detail").should("be.visible");

    // The newly added custom column should be rendered in the Detail view preview
    cy.findByTestId("object-detail")
      .findByText(CUSTOM_COLUMN_NAME)
      .should("exist");
  });
});
