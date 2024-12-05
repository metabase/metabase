import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NO_COLLECTION_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 44071", () => {
  const questionDetails = {
    name: "Test",
    query: { "source-table": ORDERS_ID },
    collection_id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
  };

  beforeEach(() => {
    H.restore();
    cy.signIn("nocollection");
    H.createQuestion(questionDetails);
  });

  it("should be able to save questions based on another questions without collection access (metabase#44071)", () => {
    cy.visit("/");
    H.newButton("Question").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Saved questions").click();
      cy.findByText(/Personal Collection/).click();
      cy.findByText(questionDetails.name).click();
    });
    H.getNotebookStep("data")
      .findByText(questionDetails.name)
      .should("be.visible");
    H.saveQuestion();
    H.appBar()
      .findByText(/Personal Collection/)
      .should("be.visible");
  });
});
