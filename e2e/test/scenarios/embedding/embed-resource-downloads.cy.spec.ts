import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  describeWithSnowplowEE,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  getDashboardCardMenu,
  main,
  popover,
  resetSnowplow,
  restore,
  setTokenFeatures,
  showDashboardCardActions,
  visitEmbeddedPage,
} from "e2e/support/helpers";

/** These tests are about the `downloads` flag for static embeds, both dashboards and questions.
 *  Unless the product changes, these should test the same things as `public-resource-downloads.cy.spec.ts`
 */

describeWithSnowplowEE(
  "Static embed dashboards/questions downloads (results and export as pdf)",
  () => {
    beforeEach(() => {
      resetSnowplow();
      cy.deleteDownloadsFolder();
    });

    describe("Static embed dashboards", () => {
      before(() => {
        restore("default");
        cy.signInAsAdmin();

        cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
          enable_embedding: true,
        });

        setTokenFeatures("all");

        cy.signOut();
      });

      afterEach(() => {
        expectNoBadSnowplowEvents();
      });

      it("#downloads=false should disable both PDF downloads and dashcard results downloads", () => {
        visitEmbeddedPage(
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
        getDashboardCardMenu().should("not.exist");
      });

      it("should be able to download a static embedded dashboard as PDF", () => {
        visitEmbeddedPage(
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

        expectGoodSnowplowEvent({
          event: "dashboard_pdf_exported",
          dashboard_id: 0,
          dashboard_accessed_via: "static-embed",
        });
      });

      it("should be able to download a static embedded dashcard as CSV", () => {
        visitEmbeddedPage(
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

        showDashboardCardActions();
        getDashboardCardMenu().click();
        popover().findByText("Download results").click();
        popover().findByText(".csv").click();

        cy.verifyDownload(".csv", { contains: true });

        expectGoodSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "dashcard",
          accessed_via: "static-embed",
          export_type: "csv",
        });
      });
    });

    describe("Static embed questions", () => {
      before(() => {
        restore("default");
        cy.signInAsAdmin();

        cy.request("PUT", `/api/card/${ORDERS_BY_YEAR_QUESTION_ID}`, {
          enable_embedding: true,
        });

        setTokenFeatures("all");

        cy.signOut();
      });

      it("#downloads=false should disable result downloads", () => {
        visitEmbeddedPage(
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
        visitEmbeddedPage(
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
        popover().findByText(".png").click();

        cy.verifyDownload(".png", { contains: true });

        expectGoodSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "question",
          accessed_via: "static-embed",
          export_type: "png",
        });
      });

      it("should be able to download a static embedded card as CSV", () => {
        visitEmbeddedPage(
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

        popover().findByText(".csv").click();

        cy.verifyDownload(".csv", { contains: true });

        expectGoodSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "question",
          accessed_via: "static-embed",
          export_type: "csv",
        });
      });
    });
  },
);

const waitLoading = () => main().findByText("Loading...").should("not.exist");
