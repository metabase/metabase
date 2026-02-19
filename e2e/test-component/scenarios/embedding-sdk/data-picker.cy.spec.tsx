import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { popover } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { Flex } from "metabase/ui";

describe("scenarios > embedding-sdk > interactive-question > creating a question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
  });

  describe("simple data picker", () => {
    it("can render the data picker", () => {
      cy.signOut();
      mockAuthProviderAndJwtSignIn();
      cy.intercept("POST", "/api/card").as("createCard");

      mountSdkContent(
        <Flex p="xl">
          <InteractiveQuestion questionId="new" />
        </Flex>,
      );

      // Wait until the entity picker modal is visible
      getSdkRoot().contains("Pick your starting data");

      popover().findByText("Orders").click();
      getSdkRoot().within(() => {
        cy.findByRole("button", { name: "Visualize" }).click();

        // Should be able to go back to the editor view
        // TODO: SDK: make this accessible
        cy.findByRole("button", { name: "Edit question" }).click();

        // Should be able to visualize the question again
        cy.findByRole("button", { name: "Visualize" }).click();

        // Should not show a loading indicator again as the question has not changed (metabase#47564)
        cy.findByTestId("loading-indicator").should("not.exist");
      });
    });
  });

  describe("multi-stage picker", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/search*", (req) => {
        if (req.query.limit === "0") {
          req.continue((res) => {
            // The data picker will fall back to multi-stage picker if there are more than or equal 100 tables and models
            res.body.total = 100;
          });
        }
      });
    });
    it("can render the data picker", () => {
      cy.signOut();
      mockAuthProviderAndJwtSignIn();
      cy.intercept("POST", "/api/card").as("createCard");

      mountSdkContent(
        <Flex p="xl">
          <InteractiveQuestion questionId="new" />
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

        // Should be able to go back to the editor view
        // TODO: SDK: make this accessible
        cy.findByRole("button", { name: "Edit question" }).click();

        // Should be able to visualize the question again
        cy.findByRole("button", { name: "Visualize" }).click();

        // Should not show a loading indicator again as the question has not changed (metabase#47564)
        cy.findByTestId("loading-indicator").should("not.exist");
      });
    });
  });
});
