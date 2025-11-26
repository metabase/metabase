import { JWT_SHARED_SECRET } from "e2e/support/helpers";

import { getEmbedSidebar, visitNewEmbedPage } from "./helpers";

const { H } = cy;

const FIRST_QUESTION_NAME = "Question With Params 1";

describe("scenarios > embedding > sdk iframe embed setup > guest-embed", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();

    H.updateSetting("embedding-secret-key", JWT_SHARED_SECRET);

    H.createNativeQuestion(
      {
        name: FIRST_QUESTION_NAME,
        native: {
          query: "select {{text}}",
          "template-tags": {
            text: {
              id: "abc-123",
              name: "text",
              "display-name": "Text",
              type: "text",
              default: null,
            },
          },
        },
      },
      {
        wrapId: true,
      },
    );

    H.mockEmbedJsToDevServer();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("Happy path", () => {
    it("Navigates through the guest-embed flow for a question and opens its embed page", () => {
      visitNewEmbedPage();

      H.expectUnstructuredSnowplowEvent({ event: "embed_wizard_opened" });

      H.waitForSimpleEmbedIframesToLoad();

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
        cy.findByTestId("embed-browse-entity-button").click();
      });

      H.entityPickerModal().within(() => {
        cy.findByText("Select a chart").should("be.visible");
        cy.findByText("Questions").click();
        cy.findByText(FIRST_QUESTION_NAME).click();
      });

      getEmbedSidebar().within(() => {
        cy.findByText("Next").click();
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

      getEmbedSidebar().within(() => {
        cy.findByText("Get code").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_options_completed",
        event_detail:
          'settings=custom,experience=chart,guestEmbedEnabled=true,guestEmbedType=guest-embed,auth=guest_embed,drills=false,withDownloads=false,withTitle=true,isSaveEnabled=false,params={"disabled":1,"locked":0,"enabled":0},theme=default',
      });

      // Get code step
      getEmbedSidebar().within(() => {
        cy.findAllByText(/Copy code/)
          .first()
          .click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_code_copied",
        event_detail:
          "experience=chart,snippetType=frontend,guestEmbedEnabled=true,guestEmbedType=guest-embed,authType=guest-embed",
      });
    });
  });
});
