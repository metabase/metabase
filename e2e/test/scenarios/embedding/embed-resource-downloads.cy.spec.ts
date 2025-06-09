const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import { createMockParameter } from "metabase-types/api/mocks";

const { PRODUCTS, PRODUCTS_ID, PEOPLE } = SAMPLE_DATABASE;

/** These tests are about the `downloads` flag for static embeds, both dashboards and questions.
 *  Unless the product changes, these should test the same things as `public-resource-downloads.cy.spec.ts`
 */

H.describeWithSnowplowEE(
  "Static embed dashboards/questions downloads (results and export as pdf)",
  () => {
    beforeEach(() => {
      H.resetSnowplow();
      cy.deleteDownloadsFolder();
    });

    describe("Static embed dashboards", () => {
      before(() => {
        H.restore("default");
        cy.signInAsAdmin();

        cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
          enable_embedding: true,
        });

        H.setTokenFeatures("all");

        cy.signOut();
      });

      afterEach(() => {
        H.expectNoBadSnowplowEvents();
      });

      it("#downloads=false should disable both PDF downloads and dashcard results downloads", () => {
        H.visitEmbeddedPage(
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

        cy.findByRole("button", { name: "Download as PDF" }).should(
          "not.exist",
        );

        // we should not have any dashcard action in a static embedded/embed scenario, so the menu should not be there
        cy.findByRole("button", { name: "Download results" }).should(
          "not.exist",
        );
      });

      it("should be able to download a static embedded dashboard as PDF", () => {
        H.visitEmbeddedPage(
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

        cy.get("header")
          .findByRole("button", { name: "Download as PDF" })
          .click();

        cy.verifyDownload("Orders in a dashboard.pdf");

        H.expectUnstructuredSnowplowEvent({
          event: "dashboard_pdf_exported",
          dashboard_id: 0,
          dashboard_accessed_via: "static-embed",
        });
      });

      it("should be able to download a static embedded dashcard as CSV", () => {
        H.visitEmbeddedPage(
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

        H.getDashboardCard().realHover();
        H.exportFromDashcard(".csv");
        cy.verifyDownload(".csv", { contains: true });

        H.expectUnstructuredSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "dashcard",
          accessed_via: "static-embed",
          export_type: "csv",
        });
      });

      describe("with dashboard parameters", () => {
        beforeEach(() => {
          cy.signInAsAdmin();

          H.setTokenFeatures("all");

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
          H.createDashboardWithQuestions({
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
            H.addOrUpdateDashboardCard({
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
          cy.get("@dashboardId").then((dashboardId) => {
            H.visitEmbeddedPage(
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

          H.getDashboardCard().realHover();
          H.exportFromDashcard(".csv");
          cy.verifyDownload(".csv", { contains: true });

          H.expectUnstructuredSnowplowEvent({
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
        H.restore("default");
        cy.signInAsAdmin();

        cy.request("PUT", `/api/card/${ORDERS_BY_YEAR_QUESTION_ID}`, {
          enable_embedding: true,
        });

        H.setTokenFeatures("all");

        cy.signOut();
      });

      it("#downloads=false should disable result downloads", () => {
        H.visitEmbeddedPage(
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

        cy.findByRole("button", { name: "Download results" }).should(
          "not.exist",
        );
      });

      it("should be able to download the question as PNG", () => {
        H.visitEmbeddedPage(
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

        cy.findByRole("button", { name: "Download results" }).click();
        H.popover().within(() => {
          cy.findByText(".png").click();
          cy.findByTestId("download-results-button").click();
        });

        cy.verifyDownload(".png", { contains: true });

        H.expectUnstructuredSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "question",
          accessed_via: "static-embed",
          export_type: "png",
        });
      });

      it("should be able to download a static embedded card as CSV", () => {
        H.visitEmbeddedPage(
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

        cy.findByRole("button", { name: "Download results" }).click();

        H.popover().within(() => {
          cy.findByText(".csv").click();
          cy.findByTestId("download-results-button").click();
        });

        cy.verifyDownload(".csv", { contains: true });

        H.expectUnstructuredSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "question",
          accessed_via: "static-embed",
          export_type: "csv",
        });
      });

      describe("with native question parameters", () => {
        const FILTER_VALUES = ["NY", "NH"];

        beforeEach(() => {
          cy.signInAsAdmin();

          H.setTokenFeatures("all");

          // Can't figure out the type if I extracted `questionDetails` to a variable.
          H.createNativeQuestion(
            {
              name: "Native question with a parameter",
              native: {
                "template-tags": {
                  state: {
                    id: "f7672b4d-1e84-1fa8-bf02-b5e584cd4535",
                    name: "state",
                    "display-name": "State",
                    type: "dimension",
                    options: {
                      "case-sensitive": false,
                    },
                    dimension: ["field", PEOPLE.STATE, null],
                    default: null,
                    "widget-type": "string/contains",
                  },
                },
                query: "select id, email, state from people where {{state}}",
              },
              parameters: [
                {
                  id: "f7672b4d-1e84-1fa8-bf02-b5e584cd4535",
                  type: "string/contains",
                  options: {
                    "case-sensitive": false,
                  },
                  target: ["dimension", ["template-tag", "state"]],
                  name: "State",
                  slug: "state",
                  default: null,
                },
              ],
              enable_embedding: true,
              embedding_params: {
                state: "enabled",
              },
            },
            {
              idAlias: "questionId",
              wrapId: true,
            },
          );
          cy.signOut();
        });

        it("should be able to download a static embedded question as CSV with correct parameters when field filters has multiple values (metabase#52430)", () => {
          cy.get("@questionId").then((questionId) => {
            H.visitEmbeddedPage(
              {
                resource: { question: Number(questionId) },
                params: {
                  state: FILTER_VALUES,
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

          const FIRST_ROW = [
            5,
            "leffler.dominique@hotmail.com",
            FILTER_VALUES[0],
          ];

          H.assertTableData({
            columns: ["ID", "EMAIL", "STATE"],
            firstRows: [FIRST_ROW],
          });

          H.downloadAndAssert(
            {
              isDashboard: false,
              isEmbed: true,
              enableFormatting: true,
              fileType: "csv",
              downloadUrl: "/api/embed/card/*/query/csv*",
              downloadMethod: "GET",
            },
            (sheet) => {
              expect(sheet["A2"].v).to.eq(FIRST_ROW[0]);
              expect(sheet["B2"].v).to.eq(FIRST_ROW[1]);
              expect(sheet["C2"].v).to.eq(FIRST_ROW[2]);
            },
          );

          H.expectUnstructuredSnowplowEvent({
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

const waitLoading = () => H.main().findByText("Loading...").should("not.exist");
