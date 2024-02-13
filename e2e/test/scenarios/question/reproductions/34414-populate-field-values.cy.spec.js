import {
  filter,
  openNotebook,
  popover,
  restore,
  visitQuestionAdhoc,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { INVOICES_ID } = SAMPLE_DATABASE;

const INVOICE_MODEL_DETAILS = {
  name: "Invoices Model",
  query: { "source-table": INVOICES_ID },
  dataset: true,
};

describe("issue 34414", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("populate field values after re-adding filter on virtual table field (metabase#34414)", () => {
    cy.createQuestion(INVOICE_MODEL_DETAILS).then(response => {
      const modelId = response.body.id;

      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: { "source-table": `card__${modelId}` },
        },
      });
    });

    openNotebook();
    filter({ mode: "notebook" });

    popover().within(() => {
      cy.findByText("Plan").click();
      assertPlanFieldValues();

      cy.log("Open filter again");
      cy.findByLabelText("Back").click();

      cy.log("Open plan field again");
      cy.findByText("Plan").click();

      assertPlanFieldValues();
    });
  });
});

function assertPlanFieldValues() {
  cy.findByText("Basic").should("be.visible");
  cy.findByText("Business").should("be.visible");
  cy.findByText("Premium").should("be.visible");
}
