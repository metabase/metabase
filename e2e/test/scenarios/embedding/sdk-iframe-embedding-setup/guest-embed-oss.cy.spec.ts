import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { JWT_SHARED_SECRET } from "e2e/support/helpers";

import { codeBlock, getEmbedSidebar, visitNewEmbedPage } from "./helpers";

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

describe(
  "scenarios > embedding > sdk iframe embed setup > guest-embed",
  { tags: "@OSS" },
  () => {
    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsAdmin();
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
        cy.intercept("GET", "api/preview_embed/card/*").as("previewEmbed");
        visitNewEmbedPage();

        H.expectUnstructuredSnowplowEvent({ event: "embed_wizard_opened" });

        H.waitForSimpleEmbedIframesToLoad();

        // Experience step
        getEmbedSidebar().within(() => {
          cy.findByLabelText("Guest").should("be.visible").should("be.checked");

          ["Metabase account (SSO)", "Exploration", "Browser"].forEach(
            (label) => {
              cy.findByLabelText(label).should("be.disabled");
            },
          );

          cy.findByTestId("upsell-card").should("be.visible");

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
        cy.findByLabelText("Allow people to drill through on data points")
          .should("be.visible")
          .should("be.disabled");
        cy.findByLabelText("Allow downloads")
          .should("be.visible")
          .should("be.disabled")
          .should("be.checked");
        cy.findByLabelText("Allow people to save new questions")
          .should("be.visible")
          .should("be.disabled");

        [
          "Allow people to drill through on data points",
          "Allow downloads",
          "Allow people to save new questions",
        ].forEach((label) => {
          cy.findByLabelText(label).should("be.disabled");
        });

        cy.findByTestId("upsell-card").should("exist");

        H.setEmbeddingParameter("Text", "Locked");
        cy.findAllByTestId("parameter-widget")
          .find("input")
          .type("Foo Bar Baz");

        H.getSimpleEmbedIframeContent()
          .findByTestId("embedding-footer")
          .should("be.visible");

        H.getSimpleEmbedIframeContent()
          .findByTestId("question-download-widget-button")
          .should("have.css", "background-color", "rgb(255, 255, 255)");

        getEmbedSidebar().within(() => {
          cy.findByTestId("appearance-section").within(() => {
            cy.findByText("Dark").click();
          });
        });

        H.getSimpleEmbedIframeContent()
          .findByTestId("question-download-widget-button")
          .should("have.css", "background-color", "rgb(7, 23, 34)");

        H.publishChanges("card");
        cy.button("Unpublish").should("be.visible");

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("Foo Bar Baz").should("be.visible");
        });

        getEmbedSidebar().within(() => {
          cy.findByText("Get code").click();
        });

        H.expectUnstructuredSnowplowEvent({
          event: "embed_wizard_options_completed",
          event_detail:
            'settings=custom,experience=chart,guestEmbedEnabled=true,guestEmbedType=guest-embed,authType=guest-embed,drills=false,withDownloads=true,withAlerts=false,withTitle=true,isSaveEnabled=false,params={"disabled":0,"locked":1,"enabled":0},theme=default',
        });

        // Get code step
        getEmbedSidebar().within(() => {
          codeBlock()
            .invoke("text")
            .should("match", /"theme":\s*\{\s*"preset":\s*"dark"\s*},/);

          cy.findAllByText(/Copy code/)
            .first()
            .click();
        });

        cy.log(
          'Embed preview requests should not have "X-Metabase-Client" header (EMB-945)',
        );
        cy.wait("@previewEmbed").then(({ request }) => {
          expect(request?.headers?.["x-metabase-client"]).to.be.undefined;
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

            cy.findByTestId("embedding-footer").should("be.visible");
          });
        });
      });
    });
  },
);
