import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  createQuestion,
  modal,
  openNotebook,
  queryBuilderHeader,
  restore,
  visitQuestion,
} from "e2e/support/helpers";

const questionDetails = {
  name: "40422",
  query: {
    "source-table": `card__${ORDERS_QUESTION_ID}`,
  },
};

describe("issue 40422", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "api/dataset/native").as("datasetNative");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should be possible to save a question based on a table after converting to SQL (metabase#40422)", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    convertToSqlAndSave();
  });

  it("should be possible to save a question based on another question after converting to SQL (metabase#40422)", () => {
    createQuestion(questionDetails, { visitQuestion: true });
    convertToSqlAndSave();
  });
});

function convertToSqlAndSave() {
  openNotebook();
  queryBuilderHeader().button("View the SQL").click();
  cy.wait("@datasetNative");
  modal().button("Convert this question to SQL").click();
  cy.findByTestId("native-query-editor").should("be.visible");
  queryBuilderHeader().findByText("Save").click();
  modal().last().findByText("Save").click();
  cy.wait("@updateCard");
}
