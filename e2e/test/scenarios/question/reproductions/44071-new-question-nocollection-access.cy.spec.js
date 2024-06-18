import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NO_COLLECTION_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  appBar,
  createQuestion,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  newButton,
  restore,
  saveQuestion,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 44071", () => {
  const questionDetails = {
    name: "Test",
    query: { "source-table": ORDERS_ID },
    collection_id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
  };

  beforeEach(() => {
    restore();
    cy.signIn("nocollection");
    createQuestion(questionDetails);
  });

  it("should be able to save questions based on another questions without collection access (metabase#44071)", () => {
    cy.visit("/");
    newButton("Question").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Saved questions").click();
      cy.findByText(/Personal Collection/).click();
      cy.findByText(questionDetails.name).click();
    });
    getNotebookStep("data")
      .findByText(questionDetails.name)
      .should("be.visible");
    saveQuestion();
    appBar()
      .findByText(/Personal Collection/)
      .should("be.visible");
  });
});
