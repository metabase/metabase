import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { restore } from "e2e/support/helpers";
import {
  describeSDK,
  getSdkRoot,
  signInAsAdminAndEnableEmbeddingSdk,
  visitSdkStory,
} from "e2e/support/helpers/e2e-embedding-sdk-helpers";

describeSDK("scenarios > embedding-sdk > interactive-dashboard", () => {
  beforeEach(() => {
    restore();
    signInAsAdminAndEnableEmbeddingSdk();
    cy.signOut();
  });

  it("should be able to display custom question layout when clicking on dashboard cards", () => {
    visitSdkStory({
      storyId: "embeddingsdk-interactivedashboard--with-custom-question-layout",
      windowEnvs: { DASHBOARD_ID: ORDERS_DASHBOARD_ID },
    });

    getSdkRoot().within(() => {
      cy.contains("Orders in a dashboard").should("be.visible");
      cy.findByText("Orders").click();
      cy.contains("Orders").should("be.visible");
      cy.contains("This is a custom question layout.");
    });
  });
});
