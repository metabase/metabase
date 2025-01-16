import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import { createMockParameter } from "metabase-types/api/mocks";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

/** These tests are about the `downloads` flag for static embeds, both dashboards and questions.
 *  Unless the product changes, these should test the same things as `public-resource-downloads.cy.spec.ts`
 */

cy.describeWithSnowplowEE(
  "Static embed dashboards/questions downloads (results and export as pdf)",
  () => {
    beforeEach(() => {
      cy.resetSnowplow();
      cy.deleteDownloadsFolder();
    });

    describe("Static embed dashboards", () => {
      before(() => {
        cy.restore("default");
        cy.signInAsAdmin();

        cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
          enable_embedding: true,
        });

        cy.setTokenFeatures("all");

        cy.signOut();
      });

      afterEach(() => {
        cy.expectNoBadSnowplowEvents();
      });

      it("#downloads=false should disable both PDF downloads and dashcard results downloads", () => {
        cy.visitEmbeddedPage(
          {
            resource: { dashboard: ORDERS_DASHBOARD_ID },
            params: {},
          },
          {
            pageStyle: {
              downloads: false,
            },
          },
        );
        waitLoading();

        // eslint-disable-next-line no-unscoped-text-selectors -- this should not appear anywhere in the page
        cy.findByText("Export as PDF").should("not.exist");

        // we should not have any dashcard action in a static embedded/embed scenario, so the menu should not be there
        cy.getDashboardCardMenu().should("not.exist");
      });

      it("should be able to download a static embedded dashboard as PDF", () => {
        cy.visitEmbeddedPage(
          {
            resource: { dashboard: ORDERS_DASHBOARD_ID },
            params: {},
          },
          {
            pageStyle: {
              downloads: true,
            },
          },
        );
        waitLoading();

        cy.get("header").findByText("Export as PDF").click();

        cy.verifyDownload("Orders in a dashboard.pdf");

        cy.expectGoodSnowplowEvent({
          event: "dashboard_pdf_exported",
          dashboard_id: 0,
          dashboard_accessed_via: "static-embed",
        });
      });

      it("should be able to download a static embedded dashcard as CSV", () => {
        cy.visitEmbeddedPage(
          {
            resource: { dashboard: ORDERS_DASHBOARD_ID },
            params: {},
          },
          {
            pageStyle: {
              downloads: true,
            },
          },
        );

        waitLoading();

        cy.showDashboardCardActions();
        cy.getDashboardCardMenu().click();
        cy.exportFromDashcard(".csv");
        cy.verifyDownload(".csv", { contains: true });

        cy.expectGoodSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "dashcard",
          accessed_via: "static-embed",
          export_type: "csv",
        });
      });

      describe("with dashboard parameters", () => {
        beforeEach(() => {
          cy.signInAsAdmin();

          cy.setTokenFeatures("all");

          // Test parameter with accentuation (metabase#49118)
          const CATEGORY_FILTER = createMockParameter({
            id: "5aefc725",
            name: "usuário",
            slug: "usu%C3%A1rio",
            type: "string/=",
          });
          const questionDetails = {
            name: "Products",
            query: {
              "source-table": PRODUCTS_ID,
            },
          };
          cy.createDashboardWithQuestions({
            // Can't figure out the type if I extracted `dashboardDetails` to a variable.
            dashboardDetails: {
              name: "Dashboard with a parameter",
              parameters: [CATEGORY_FILTER],
              enable_embedding: true,
              embedding_params: {
                [CATEGORY_FILTER.slug]: "enabled",
              },
            },
            questions: [questionDetails],
          }).then(({ dashboard, questions }) => {
            const dashboardId = dashboard.id;
            cy.wrap(dashboardId).as("dashboardId");
            const questionId = questions[0].id;
            cy.addOrUpdateDashboardCard({
              dashboard_id: dashboardId,
              card_id: questionId,
              card: {
                parameter_mappings: [
                  {
                    card_id: questionId,
                    parameter_id: CATEGORY_FILTER.id,
                    target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                  },
                ],
              },
            });
          });

          cy.signOut();
        });

        it("should be able to download a static embedded dashcard as CSV", () => {
          cy.get("@dashboardId").then(dashboardId => {
            cy.visitEmbeddedPage(
              {
                resource: { dashboard: Number(dashboardId) },
                params: {},
              },
              {
                pageStyle: {
                  downloads: true,
                },
              },
            );
          });

          waitLoading();

          cy.showDashboardCardActions();
          cy.getDashboardCardMenu().click();
          cy.exportFromDashcard(".csv");
          cy.verifyDownload(".csv", { contains: true });

          cy.expectGoodSnowplowEvent({
            event: "download_results_clicked",
            resource_type: "dashcard",
            accessed_via: "static-embed",
            export_type: "csv",
          });
        });
      });
    });

    describe("Static embed questions", () => {
      before(() => {
        cy.restore("default");
        cy.signInAsAdmin();

        cy.request("PUT", `/api/card/${ORDERS_BY_YEAR_QUESTION_ID}`, {
          enable_embedding: true,
        });

        cy.setTokenFeatures("all");

        cy.signOut();
      });

      it("#downloads=false should disable result downloads", () => {
        cy.visitEmbeddedPage(
          {
            resource: { question: ORDERS_BY_YEAR_QUESTION_ID },
            params: {},
          },
          {
            pageStyle: {
              downloads: false,
            },
          },
        );

        waitLoading();

        cy.findByTestId("download-button").should("not.exist");
      });

      it("should be able to download the question as PNG", () => {
        cy.visitEmbeddedPage(
          {
            resource: { question: ORDERS_BY_YEAR_QUESTION_ID },
            params: {},
          },
          {
            pageStyle: {
              downloads: true,
            },
          },
        );

        waitLoading();

        cy.findByTestId("download-button").click();
        cy.popover().within(() => {
          cy.findByText(".png").click();
          cy.findByTestId("download-results-button").click();
        });

        cy.verifyDownload(".png", { contains: true });

        cy.expectGoodSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "question",
          accessed_via: "static-embed",
          export_type: "png",
        });
      });

      it("should be able to download a static embedded card as CSV", () => {
        cy.visitEmbeddedPage(
          {
            resource: { question: ORDERS_BY_YEAR_QUESTION_ID },
            params: {},
          },
          {
            pageStyle: {
              downloads: true,
            },
          },
        );

        waitLoading();

        cy.findByTestId("download-button").click();

        cy.popover().within(() => {
          cy.findByText(".csv").click();
          cy.findByTestId("download-results-button").click();
        });

        cy.verifyDownload(".csv", { contains: true });

        cy.expectGoodSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "question",
          accessed_via: "static-embed",
          export_type: "csv",
        });
      });

      describe("with native question parameters", () => {
        beforeEach(() => {
          cy.signInAsAdmin();

          cy.setTokenFeatures("all");

          // Can't figure out the type if I extracted `questionDetails` to a variable.
          cy.createNativeQuestion(
            {
              name: "Native question with a parameter",
              native: {
                "template-tags": {
                  num: {
                    id: "f7672b4d-1e84-1fa8-bf02-b5e584cd4535",
                    name: "num",
                    "display-name": "Num",
                    type: "number",
                    default: null,
                  },
                },
                query: "select {{num}}",
              },
              parameters: [
                {
                  id: "f7672b4d-1e84-1fa8-bf02-b5e584cd4535",
                  type: "number/=",
                  target: ["variable", ["template-tag", "num"]],
                  name: "Num",
                  slug: "num",
                  default: null,
                },
              ],
              enable_embedding: true,
              embedding_params: {
                num: "enabled",
              },
            },
            {
              idAlias: "questionId",
              wrapId: true,
            },
          );

          cy.signOut();
        });

        it("should be able to download a static embedded dashcard as CSV", () => {
          const value = 9999;
          cy.get("@questionId").then(questionId => {
            cy.visitEmbeddedPage(
              {
                resource: { question: Number(questionId) },
                params: {
                  num: value,
                },
              },
              {
                pageStyle: {
                  downloads: true,
                },
              },
            );
          });

          waitLoading();

          cy.main().findByText(value).should("exist");

          cy.findByTestId("download-button").click();

          cy.popover().within(() => {
            cy.findByText(".csv").click();
            cy.findByTestId("download-results-button").click();
          });

          cy.verifyDownload(".csv", { contains: true });

          cy.expectGoodSnowplowEvent({
            event: "download_results_clicked",
            resource_type: "question",
            accessed_via: "static-embed",
            export_type: "csv",
          });
        });
      });
    });
  },
);

const waitLoading = () =>
  cy.main().findByText("Loading...").should("not.exist");
