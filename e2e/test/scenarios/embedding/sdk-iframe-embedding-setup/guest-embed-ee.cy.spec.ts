import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  JWT_SHARED_SECRET,
  embedModalEnableEmbedding,
  entityPickerModal,
  getParametersContainer,
} from "e2e/support/helpers";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

import {
  codeBlock,
  getEmbedSidebar,
  navigateToEmbedOptionsStep,
  visitNewEmbedPage,
} from "./helpers";

const { H } = cy;

const { ORDERS_ID } = SAMPLE_DATABASE;

const DASHBOARD_NAME = "Dashboard with Parameters";
const DASHBOARD_PARAMETERS = [
  {
    name: "ID",
    slug: "id",
    id: "11111111",
    type: "id",
  },
  {
    name: "Product ID",
    slug: "product_id",
    id: "22222222",
    type: "id",
  },
];

const FIRST_QUESTION_NAME = "Question With Params 1";
const SECOND_QUESTION_NAME = "Question With Params 2";

describe("scenarios > embedding > sdk iframe embed setup > guest-embed", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();

    H.updateSetting("embedding-secret-key", JWT_SHARED_SECRET);

    H.createQuestionAndDashboard({
      questionDetails: {
        name: "Orders table",
        query: { "source-table": ORDERS_ID },
      },
      dashboardDetails: {
        name: DASHBOARD_NAME,
        parameters: DASHBOARD_PARAMETERS,
      },
    }).then(({ body: card }) => {
      cy.wrap(card.dashboard_id).as("dashboardId");
    });

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
        enable_embedding: false,
      },
      {
        wrapId: true,
        idAlias: "question1Id",
      },
    );

    H.createNativeQuestion(
      {
        name: SECOND_QUESTION_NAME,
        native: {
          query: "select {{text}}",
          "template-tags": {
            text1: {
              id: "abc-123",
              name: "text1",
              "display-name": "Text1",
              type: "text",
              default: null,
              required: true,
            },
            text2: {
              id: "abc-456",
              name: "text2",
              "display-name": "Text2",
              type: "text",
              default: null,
              required: false,
            },
          },
        },
        enable_embedding: true,
        embedding_params: {
          text1: "enabled",
          state2: "disabled",
        },
      },
      {
        wrapId: true,
        idAlias: "question2Id",
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
        cy.findByLabelText("Guest").should("be.visible").should("be.checked");

        cy.findByTestId("upsell-card").should("not.exist");

        cy.findByText("Chart").click();
        cy.findByText("Next").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_experience_completed",
        event_detail:
          "authType=guest-embed,experience=chart,isDefaultExperience=false",
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
      cy.findByLabelText("Guest").should("not.exist");
      cy.findByLabelText("Allow people to drill through on data points")
        .should("be.visible")
        .should("be.disabled");
      cy.findByLabelText("Allow downloads")
        .should("be.visible")
        .should("not.be.disabled")
        .should("not.be.checked");
      cy.findByLabelText("Allow people to save new questions")
        .should("be.visible")
        .should("be.disabled");

      H.setEmbeddingParameter("Text", "Locked");
      cy.findAllByTestId("parameter-widget").find("input").type("Foo Bar Baz");

      getEmbedSidebar().within(() => {
        cy.findByTestId("upsell-card").should("not.exist");
      });

      H.publishChanges("card");
      cy.button("Unpublish").should("be.visible");

      H.getSimpleEmbedIframeContent().within(() => {
        cy.findByText("Foo Bar Baz").should("be.visible");
      });

      H.getSimpleEmbedIframeContent()
        .findByTestId("embedding-footer")
        .should("not.exist");

      getEmbedSidebar().within(() => {
        cy.findByText("Get code").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_options_completed",
        event_detail:
          'settings=custom,experience=chart,guestEmbedEnabled=true,guestEmbedType=guest-embed,authType=guest-embed,drills=false,withDownloads=false,withAlerts=false,withTitle=true,isSaveEnabled=false,params={"disabled":0,"locked":1,"enabled":0},theme=default',
      });

      // Get code step
      getEmbedSidebar().within(() => {
        cy.findByTestId("publish-guest-embed-link").should("not.exist");
      });

      H.unpublishChanges("card");

      getEmbedSidebar().within(() => {
        cy.findByTestId("publish-guest-embed-link").should("be.visible");

        cy.findByText(/Copy code/).should("not.exist");
      });

      H.publishChanges("card");

      getEmbedSidebar().within(() => {
        cy.findByTestId("publish-guest-embed-link").should("not.exist");
      });

      getEmbedSidebar().within(() => {
        cy.findAllByText(/Copy code/)
          .first()
          .click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_code_copied",
        event_detail:
          "experience=chart,snippetType=frontend,guestEmbedEnabled=true,guestEmbedType=guest-embed,authSubType=none",
      });

      // Visit embed page
      getEmbedSidebar().within(() => {
        codeBlock()
          .invoke("text")
          .then((code: string) => {
            const match = code.match(/token="([^"]+)"/);
            expect(match, "JWT token present in code block").to.not.be.null;
            const jwtToken = match ? match[1] : "";
            cy.wrap(jwtToken).as("guestEmbedToken");
          });
      });

      cy.get<string>("@guestEmbedToken").then((token) => {
        const frame = H.loadSdkIframeEmbedTestPage({
          metabaseConfig: { isGuest: true },
          elements: [
            {
              component: "metabase-question",
              attributes: {
                token,
              },
            },
          ],
        });

        frame.within(() => {
          cy.findByText("Foo Bar Baz").should("be.visible");

          cy.findByTestId("embedding-footer").should("not.exist");
        });
      });
    });

    it("Properly re-initializes embedding parameters and Guest Embed navbar", () => {
      cy.get("@question1Id").then((questionId) => {
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
        });

        navigateToEmbedOptionsStep({
          experience: "chart",
          resourceName: FIRST_QUESTION_NAME,
        });

        cy.button("Unpublish").should("be.visible");

        getParametersContainer()
          .findByLabelText("Text")
          .should("contain.text", "Disabled");

        getEmbedSidebar().within(() => {
          cy.findByText("Back").click();

          cy.findByTestId("embed-browse-entity-button").click();
        });

        entityPickerModal().within(() => {
          cy.findByText("Questions").click();
          cy.findAllByText(SECOND_QUESTION_NAME).first().click();
        });

        getEmbedSidebar().within(() => {
          cy.findByText("Next").click();
        });

        cy.button("Unpublish").should("be.visible");

        getParametersContainer()
          .findByLabelText("Text1")
          .should("contain.text", "Editable");

        getParametersContainer()
          .findByLabelText("Text2")
          .should("contain.text", "Disabled");

        H.setEmbeddingParameter("Text1", "Locked");

        cy.button("Publish changes").should("be.visible");

        getEmbedSidebar().within(() => {
          cy.findByText("Back").click();

          cy.findByTestId("embed-browse-entity-button").click();
        });

        entityPickerModal().within(() => {
          cy.findByText("Questions").click();
          cy.findAllByText(FIRST_QUESTION_NAME).first().click();
        });

        getEmbedSidebar().within(() => {
          cy.findByText("Next").click();
        });

        cy.button("Unpublish").should("be.visible");

        getParametersContainer()
          .findByLabelText("Text")
          .should("contain.text", "Disabled");
      });
    });

    it("Properly adjusts EmbedJS options when switching between guest/sso modes for a Dashboard", () => {
      cy.get("@dashboardId").then((dashboardId) => {
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          enable_embedding: true,
        });

        enableJwtAuth();

        navigateToEmbedOptionsStep({
          experience: "dashboard",
          resourceName: DASHBOARD_NAME,
        });

        getEmbedSidebar().within(() => {
          cy.findByLabelText("Guest").should("not.exist");
        });

        H.setEmbeddingParameter("Product ID", "Locked");

        getEmbedSidebar().within(() => {
          cy.findByText("Get code").click();

          codeBlock().first().should("contain", "token=");

          codeBlock().first().should("not.contain", "dashboard-id=");
          codeBlock().first().should("not.contain", "hidden-parameters=");
          codeBlock().first().should("not.contain", "locked-parameters=");

          cy.findByText("Back").click();
          cy.findByText("Back").click();
          cy.findByText("Back").click();

          cy.findByLabelText("Guest").should("be.visible").should("be.checked");

          cy.findByLabelText("Metabase account (SSO)").click();
        });

        embedModalEnableEmbedding();

        getEmbedSidebar().within(() => {
          cy.findByText("Next").click();
          cy.findByText("Next").click();
          cy.findByText("Get code").click();

          codeBlock().first().should("contain", "dashboard-id=");
          codeBlock().first().should("contain", "hidden-parameters=");

          codeBlock().first().should("not.contain", "token=");
          codeBlock().first().should("not.contain", "locked-parameters=");
        });
      });
    });
  });
});
