import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_BY_YEAR_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  assertNotEmptyObject,
  describeWithSnowplowEE,
  downloadAndAssert,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  getDashboardCardMenu,
  main,
  popover,
  resetSnowplow,
  restore,
  setTokenFeatures,
  showDashboardCardActions,
} from "e2e/support/helpers";

/** These tests are about the `downloads` flag for public dashboards and questions.
 *  Unless the product changes, these should test the same things as `embed-resource-downloads.cy.spec.ts`
 */

describeWithSnowplowEE(
  "Public dashboards/questions downloads (results and export as pdf)",
  () => {
    beforeEach(() => {
      resetSnowplow();
      cy.deleteDownloadsFolder();
    });

    describe("Public dashboards", () => {
      let publicLink: string;

      before(() => {
        restore("default");
        cy.signInAsAdmin();
        setTokenFeatures("all");

        cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);

        cy.icon("share").click();
        popover().findByText("Create a public link").click();

        popover()
          .findByTestId("public-link-input")
          .should("not.have.value", "")
          .invoke("val")
          .then(url => {
            publicLink = url as string;
          });

        cy.signOut();
      });

      afterEach(() => {
        expectNoBadSnowplowEvents();
      });

      it("#downloads=false should disable both PDF downloads and dashcard results downloads", () => {
        cy.visit(`${publicLink}#downloads=false`);
        waitLoading();

        // eslint-disable-next-line no-unscoped-text-selectors -- this should not appear anywhere in the page
        cy.findByText("Export as PDF").should("not.exist");

        // we should not have any dashcard action in a public/embed scenario, so the menu should not be there
        getDashboardCardMenu().should("not.exist");
      });

      it("should be able to download a public dashboard as PDF", () => {
        cy.visit(`${publicLink}#downloads=true`);
        waitLoading();

        cy.get("header").findByText("Export as PDF").click();

        cy.verifyDownload("Orders in a dashboard.pdf");

        expectGoodSnowplowEvent({
          event: "dashboard_pdf_exported",
          dashboard_id: 0,
          dashboard_accessed_via: "public-link",
        });
      });

      it("should be able to download a public dashcard as CSV", () => {
        cy.visit(`${publicLink}`);
        waitLoading();

        showDashboardCardActions();

        const uuid = publicLink.split("/").at(-1);

        downloadAndAssert(
          {
            publicUuid: uuid,
            fileType: "csv",
            questionId: ORDERS_BY_YEAR_QUESTION_ID,
            isDashboard: true,
            dashcardId: ORDERS_DASHBOARD_DASHCARD_ID,
          },
          assertNotEmptyObject,
        );

        expectGoodSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "dashcard",
          accessed_via: "public-link",
          export_type: "csv",
        });
      });
    });

    describe("Public questions", () => {
      let publicLink: string;

      before(() => {
        restore("default");
        cy.signInAsAdmin();
        setTokenFeatures("all");

        cy.visit(`/question/${ORDERS_BY_YEAR_QUESTION_ID}`);

        cy.icon("share").click();
        popover().findByText("Create a public link").click();

        popover()
          .findByTestId("public-link-input")
          .invoke("val")
          .then(url => {
            publicLink = url as string;
          });

        cy.signOut();
      });

      it("#downloads=false should disable result downloads", () => {
        cy.visit(`${publicLink}#downloads=false`);
        waitLoading();

        cy.findByTestId("download-button").should("not.exist");
      });

      it("should be able to download the question as PNG", () => {
        cy.visit(`${publicLink}`);
        waitLoading();

        cy.findByTestId("download-button").click();
        popover().findByText(".png").click();

        cy.verifyDownload(".png", { contains: true });

        expectGoodSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "question",
          accessed_via: "public-link",
          export_type: "png",
        });
      });

      it("should be able to download a public card as CSV", () => {
        cy.visit(`${publicLink}`);
        waitLoading();

        cy.findByTestId("download-button").should("exist");

        const uuid = publicLink.split("/").at(-1);

        downloadAndAssert(
          {
            publicUuid: uuid,
            fileType: "csv",
            questionId: ORDERS_BY_YEAR_QUESTION_ID,
            isDashboard: false,
          },
          assertNotEmptyObject,
        );

        expectGoodSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "question",
          accessed_via: "public-link",
          export_type: "csv",
        });
      });
    });
  },
);

const waitLoading = () => main().findByText("Loading...").should("not.exist");
