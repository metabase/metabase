import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const ORDERS_MODEL = {
  name: "Order",
  dataset: true,
  display: "table",
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
  },
};

describe("Model actions in object detail view", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.createQuestion(ORDERS_MODEL, {
      wrapId: true,
      idAlias: "modelId",
    });
    cy.signOut();
  });

  it("scenario", () => {
    cy.signInAsNormalUser();

    cy.get("@modelId").then(modelId => {
      cy.visit(`/model/${modelId}/detail`);
      cy.log("actions tab should not be shown in model page");
      cy.findByText("Actions").should("not.exist");

      cy.visit(`/model/${modelId}/detail/1`);
      cy.log("actions dropdown should not be shown in object details modal");
      cy.findByTestId("actions-menu").should("not.exist");
    });

    cy.signOut();
  });
});
