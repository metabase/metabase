import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import {
  ORDERS_QUESTION_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { entityPickerModal, modal } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

describe("SDK reproductions - sdk-question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  describe("should prioritize targetCollection over recents dashboards (metabase#61870)", () => {
    const saveQuestionToDashboard = () => {
      cy.log("Render a first question to be saved to a dashboard");
      mountSdkContent(<InteractiveQuestion questionId="new" />);

      cy.intercept("POST", "/api/card").as("createCard_1");

      openSaveModalFromNewSdkQuestion();

      cy.findByTestId("dashboard-and-collection-picker-button").click();

      entityPickerModal().within(() => {
        cy.findByText("Orders in a dashboard").click();
        cy.findByText("Select this dashboard").click();
      });

      modal().findByText("Save").should("be.visible").click();

      cy.wait("@createCard_1");
    };

    it("with <InteractiveQuestion questionId='new' />", () => {
      saveQuestionToDashboard();

      cy.intercept("POST", "/api/card").as("createCard_2");

      cy.log("Render a second question with targetCollection");
      mountSdkContent(
        <InteractiveQuestion
          questionId="new"
          targetCollection={THIRD_COLLECTION_ID}
        />,
      );

      openSaveModalFromNewSdkQuestion();

      modal().findByLabelText("Name").clear().type("New question name");
      modal().findByText("Save").should("be.visible").click();

      cy.wait("@createCard_2").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(response?.body.name).to.equal("New question name");
        expect(response?.body.collection_id).to.equal(THIRD_COLLECTION_ID);
      });
    });

    it("when starting from a saved question", () => {
      saveQuestionToDashboard();

      cy.intercept("POST", "/api/card").as("createCard_2");

      cy.log("Render a second question with targetCollection");
      mountSdkContent(
        <InteractiveQuestion
          questionId={ORDERS_QUESTION_ID}
          targetCollection={THIRD_COLLECTION_ID}
        />,
      );

      getSdkRoot().within(() => {
        cy.findByText("Summarize").should("be.visible").click();
        cy.findByText("Count of rows").should("be.visible").click();
        cy.findByText("Save").should("be.visible").click();
        cy.findByText("Save as new question").should("be.visible").click();
      });

      modal().findByLabelText("Name").clear().type("New question name");
      modal().findByText("Save").should("be.visible").click();

      cy.wait("@createCard_2").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(response?.body.name).to.equal("New question name");
        expect(response?.body.collection_id).to.equal(THIRD_COLLECTION_ID);
      });
    });
  });
});

function openSaveModalFromNewSdkQuestion() {
  getSdkRoot().within(() => {
    cy.findByText("Orders").should("be.visible").click();
    cy.findByText("Save").should("be.visible").click();
  });
}
