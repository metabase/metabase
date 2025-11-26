const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import { createMockParameter } from "metabase-types/api/mocks";

const { PRODUCTS, PRODUCTS_ID, PEOPLE } = SAMPLE_DATABASE;
import * as DateFilter from "../native-filters/helpers/e2e-date-filter-helpers";

/** These tests are about the `downloads` flag for static embeds, both dashboards and questions.
 *  Unless the product changes, these should test the same things as `public-resource-downloads.cy.spec.ts`
 */

describe("Static embed dashboards/questions downloads (results and export as pdf)", () => {
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

      H.activateToken("pro-self-hosted");

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

      cy.findByRole("button", { name: "Download as PDF" }).should("not.exist");

      // we should not have any dashcard action in a static embedded/embed scenario, so the menu should not be there
      cy.findByRole("button", { name: "Download results" }).should("not.exist");
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
      H.getEmbeddedDashboardCardMenu().click();
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

        H.activateToken("pro-self-hosted");

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
        H.getEmbeddedDashboardCardMenu().click();
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

      H.activateToken("pro-self-hosted");

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

      cy.findByRole("button", { name: "Download results" }).should("not.exist");
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
      beforeEach(() => {
        cy.signInAsAdmin();

        H.activateToken("pro-self-hosted");
      });

      it("should be able to download a static embedded question as CSV with correct parameters when field filters has multiple values (metabase#52430)", () => {
        const FILTER_VALUES = ["NY", "CA"];
        const QUESTION_NAME = "Native question with a Field parameter";

        // Can't figure out the type if I extracted `questionDetails` to a variable.
        H.createNativeQuestion(
          {
            name: QUESTION_NAME,
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
              query:
                "select id, email, state from people where {{state}} limit 2",
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
              // should ignore `?locale=xx` search parameter when downloading results from questions without parameters (metabase#53037)
              qs: {
                locale: "en",
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
        const SECOND_ROW = [13, "mustafa.thiel@hotmail.com", FILTER_VALUES[1]];

        H.assertTableData({
          columns: ["ID", "EMAIL", "STATE"],
          firstRows: [FIRST_ROW, SECOND_ROW],
        });

        cy.findByRole("heading", { name: QUESTION_NAME }).realHover();
        H.downloadAndAssert({
          isDashboard: false,
          isEmbed: true,
          enableFormatting: true,
          fileType: "csv",
          downloadUrl: "/api/embed/card/*/query/csv*",
          downloadMethod: "GET",
        });

        H.expectUnstructuredSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "question",
          accessed_via: "static-embed",
          export_type: "csv",
        });
      });

      it("should be able to download a static embedded question as CSV when a filter expects 1 parameter value e.g. date (metabase#58957, 59074)", () => {
        const FILTER_VALUE = "2025-02-11";
        const QUESTION_NAME = "Native question with a Date parameter";

        // Can't figure out the type if I extracted `questionDetails` to a variable.
        H.createNativeQuestion(
          {
            name: QUESTION_NAME,
            native: {
              "template-tags": {
                created_at: {
                  id: "c9bbcc68-c59b-4ac1-b5e7-50d2123b4150",
                  name: "created_at",
                  "display-name": "Created At",
                  type: "date",
                },
              },
              query:
                "select id, created_at, quantity from orders where created_at >= {{created_at}} limit 1",
            },
            parameters: [
              {
                id: "c9bbcc68-c59b-4ac1-b5e7-50d2123b4150",
                type: "date/single",
                options: {
                  "case-sensitive": false,
                },
                target: ["variable", ["template-tag", "created_at"]],
                name: "Created At",
                slug: "created_at",
              },
            ],
            enable_embedding: true,
            embedding_params: {
              created_at: "enabled",
            },
          },
          {
            idAlias: "questionId",
            wrapId: true,
          },
        );
        cy.signOut();

        cy.get("@questionId").then((questionId) => {
          H.visitEmbeddedPage(
            {
              resource: { question: Number(questionId) },
              params: {},
            },
            {
              pageStyle: {
                downloads: true,
              },
              // should ignore `?locale=xx` search parameter when downloading results from questions with visible parameters (metabase#53037)
              qs: {
                locale: "en",
              },
            },
          );
        });

        cy.button("Created At").should("be.visible").click();
        DateFilter.setSingleDate(FILTER_VALUE);
        H.popover().findByText("Add filter").click();

        waitLoading();

        const FIRST_ROW = [1, "February 11, 2025, 9:40 PM", 2];

        H.assertTableData({
          columns: ["ID", "CREATED_AT", "QUANTITY"],
          firstRows: [FIRST_ROW],
        });

        cy.findByRole("heading", { name: QUESTION_NAME }).realHover();
        H.downloadAndAssert({
          isDashboard: false,
          isEmbed: true,
          enableFormatting: true,
          fileType: "csv",
          downloadUrl: "/api/embed/card/*/query/csv*",
          downloadMethod: "GET",
        });
      });
    });
  });
});

const waitLoading = () => H.main().findByText("Loading...").should("not.exist");
