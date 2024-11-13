import { entityPickerModal, modal, popover } from "e2e/support/helpers";

export function saveInteractiveQuestionAsNewQuestion(options: {
  questionName: string;
  entityName: string;
  collectionPickerPath?: string[];
}) {
  const { questionName, entityName, collectionPickerPath } = options;

  cy.intercept("POST", "/api/card").as("createCard");

  cy.findAllByTestId("cell-data").last().click();
  popover().findByText(`See these ${entityName}`).click();
  cy.findByRole("button", { name: "Save" }).click();

  modal().within(() => {
    cy.findByRole("radiogroup").findByText("Save as new question").click();

    cy.findByPlaceholderText("What is the name of your question?")
      .clear()
      .type(questionName);
  });

  if (collectionPickerPath) {
    cy.findByTestId("collection-picker-button").click();

    entityPickerModal().within(() => {
      collectionPickerPath.forEach(collectionName =>
        cy.findByText(collectionName).click(),
      );

      cy.findByRole("button", { name: "Select" }).click();
    });
  }

  modal().within(() => {
    cy.findByRole("button", { name: "Save" }).click();
  });
}
