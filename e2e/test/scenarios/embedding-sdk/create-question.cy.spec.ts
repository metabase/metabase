import {
  entityPickerModal,
  modal,
  restore,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";
import {
  EMBEDDING_SDK_STORY_HOST,
  describeSDK,
  getSdkRoot,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { JWT_SHARED_SECRET } from "e2e/support/helpers/e2e-jwt-helpers";

describeSDK("scenarios > embedding-sdk > create-question", () => {
  beforeEach(() => {
    restore();
    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();
  });

  it("can create a question via the CreateQuestion component", () => {
    cy.intercept("POST", "/api/card").as("createCard");

    cy.intercept("POST", "/api/dataset", req => {
      // throttling makes the loading indicator shows up
      // reliably when we click on visualize.
      req.on("response", res => {
        res.setThrottle(1000);
      });
    });

    visitFullAppEmbeddingUrl({
      url: EMBEDDING_SDK_STORY_HOST,
      qs: { id: "embeddingsdk-createquestion--default", viewMode: "story" },
      onBeforeLoad: (window: any) => {
        window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
        window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
      },
    });

    // Wait until the entity picker modal is visible
    getSdkRoot().contains("Pick your starting data");

    entityPickerModal().within(() => {
      cy.findByText("Tables").click();
      cy.findByText("Orders").click();
    });

    getSdkRoot().within(() => {
      // The question title's header should be "New question" by default.
      cy.contains("New question");

      cy.findByRole("button", { name: "Visualize" }).click();

      // Should show a loading indicator (metabase#47564)
      cy.findByTestId("loading-indicator").should("exist");

      // Should be able to go back to the editor view
      cy.findByRole("button", { name: "Show editor" }).click();

      // Should be able to visualize the question again
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
