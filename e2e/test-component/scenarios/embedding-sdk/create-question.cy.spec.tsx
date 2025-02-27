import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { describeEE, modal, popover } from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { Flex } from "metabase/ui";

describeEE("scenarios > embedding-sdk > creating a question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  it("can create a question via the InteractiveQuestion component", () => {
    cy.signOut();
    mockAuthProviderAndJwtSignIn();
    cy.intercept("POST", "/api/card").as("createCard");

    mountSdkContent(
      <Flex p="xl">
        <InteractiveQuestion />
      </Flex>,
    );

    // Wait until the entity picker modal is visible
    getSdkRoot().contains("Pick your starting data");

    popover().within(() => {
      cy.findByText("Raw Data").click();
      cy.findByText("Orders").click();
    });

    getSdkRoot().within(() => {
      cy.findByRole("button", { name: "Visualize" }).click();

      // Should not show a loading indicator again as the question has not changed (metabase#47564)
      cy.findByTestId("loading-indicator").should("not.exist");

      // Should be able to save to a new question right away
      cy.findByRole("button", { name: "Save" }).click();
    });

    modal().within(() => {
      cy.findByPlaceholderText("What is the name of your question?")
        .clear()
        .type("My Orders");

      cy.findByRole("button", { name: "Save" }).click();
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("My Orders");
    });

    // The question title's header should be updated.
    getSdkRoot().contains("My Orders");
  });
});
