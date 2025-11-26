import { JWT_SHARED_SECRET } from "e2e/support/helpers";

import { getEmbedSidebar, visitNewEmbedPage } from "./helpers";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > guest-embed", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();

    H.updateSetting("embedding-secret-key", JWT_SHARED_SECRET);

    H.mockEmbedJsToDevServer();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("Happy path", () => {
    it("Navigates through the guest-embed flow and opens a page with guest embed", () => {
      visitNewEmbedPage();

      H.expectUnstructuredSnowplowEvent({ event: "embed_wizard_opened" });

      // Experience step
      getEmbedSidebar().within(() => {
        cy.findByText("Chart").click();
        cy.findByText("Next").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_experience_completed",
        event_detail: "custom=chart",
      });

      // Entity selection step
      getEmbedSidebar().within(() => {
        cy.findByText("Next").click(); // Entity selection step
      });

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_resource_selection_completed",
        event_detail: "isDefaultResource=false,experience=chart",
      });

      // Options step
      cy.findByLabelText("Guest").should("be.visible").should("be.checked");

      cy.findByLabelText("Allow people to drill through on data points")
        .should("be.visible")
        .should("be.disabled");
      cy.findByLabelText("Allow people to save new questions")
        .should("be.visible")
        .should("be.disabled");

      H.publishChanges("card");
      cy.button("Unpublish").should("be.visible");
    });
  });
});
