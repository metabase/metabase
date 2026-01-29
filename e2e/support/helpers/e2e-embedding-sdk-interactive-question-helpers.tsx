import {
  entityPickerModal,
  modal,
  popover,
} from "e2e/support/helpers/e2e-ui-elements-helpers";

import { pickEntity } from "./e2e-collection-helpers";

export function saveInteractiveQuestionAsNewQuestion(options: {
  questionName: string;
  entityName: string;
  collectionPickerPath?: string[];
}) {
  const { questionName, entityName, collectionPickerPath } = options;

  cy.intercept("POST", "/api/card").as("createCard");

  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByTestId("cell-data").last().click();
  popover().findByText(`See these ${entityName}`).click();
  cy.findByRole("button", { name: "Save" }).click();

  modal().within(() => {
    cy.findByText("Save as new question").click();

    cy.findByPlaceholderText("What is the name of your question?")
      .clear()
      .type(questionName);
  });

  if (collectionPickerPath) {
    cy.findByTestId("dashboard-and-collection-picker-button").click();

    pickEntity({ path: collectionPickerPath, select: true });
  }

  modal().within(() => {
    cy.findByRole("button", { name: "Save" }).click();
  });
}
