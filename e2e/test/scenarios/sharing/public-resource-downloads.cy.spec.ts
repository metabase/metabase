import { H } from "e2e/support";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

/** These tests are about the `downloads` flag for public dashboards and questions.
 *  Unless the product changes, these should test the same things as `embed-resource-downloads.cy.spec.ts`
 */

H.describeWithSnowplowEE(
  "Public dashboards/questions downloads (results and export as pdf)",
  () => {
    beforeEach(() => {
      H.resetSnowplow();
      cy.deleteDownloadsFolder();
    });

    describe("Public dashboards", () => {
      let publicLink: string;

      before(() => {
        H.restore("default");
        cy.signInAsAdmin();
        H.setTokenFeatures("all");

        cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);

        H.openSharingMenu("Create a public link");

        H.popover()
          .findByTestId("public-link-input")
          .should("contain.value", "/public/")
          .invoke("val")
          .then(url => {
            publicLink = url as string;
          });

        cy.signOut();
      });

      afterEach(() => {
        H.expectNoBadSnowplowEvents();
      });

      it("#downloads=false should disable both PDF downloads and dashcard results downloads", () => {
        cy.visit(`${publicLink}#downloads=false`);
        waitLoading();

        // eslint-disable-next-line no-unscoped-text-selectors -- this should not appear anywhere in the page
        cy.findByText("Export as PDF").should("not.exist");

        // we should not have any dashcard action in a public/embed scenario, so the menu should not be there
        H.getDashboardCardMenu().should("not.exist");
      });

      it("should be able to download a public dashboard as PDF", () => {
        cy.visit(`${publicLink}#downloads=true`);
        waitLoading();

        cy.get("header").findByText("Export as PDF").click();

        cy.verifyDownload("Orders in a dashboard.pdf");

        H.expectGoodSnowplowEvent({
          event: "dashboard_pdf_exported",
          dashboard_id: 0,
          dashboard_accessed_via: "public-link",
        });
      });

      it("should be able to download a public dashcard as CSV", () => {
        cy.visit(`${publicLink}`);
        waitLoading();

        H.showDashboardCardActions();

        const uuid = publicLink.split("/").at(-1);

        H.downloadAndAssert(
          {
            publicUuid: uuid,
            fileType: "csv",
            questionId: ORDERS_BY_YEAR_QUESTION_ID,
            isDashboard: true,
            dashcardId: ORDERS_DASHBOARD_DASHCARD_ID,
          },
          H.assertNotEmptyObject,
        );

        H.expectGoodSnowplowEvent({
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
        H.restore("default");
        cy.signInAsAdmin();
        H.setTokenFeatures("all");

        cy.visit(`/question/${ORDERS_BY_YEAR_QUESTION_ID}`);

        H.openSharingMenu("Create a public link");

        H.popover()
          .findByTestId("public-link-input")
          .should("contain.value", "/public/")
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
        H.popover().within(() => {
          cy.findByText(".png").click();
          cy.findByTestId("download-results-button").click();
        });

        cy.verifyDownload(".png", { contains: true });

        H.expectGoodSnowplowEvent({
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

        H.downloadAndAssert(
          {
            publicUuid: uuid,
            fileType: "csv",
            questionId: ORDERS_BY_YEAR_QUESTION_ID,
            isDashboard: false,
          },
          H.assertNotEmptyObject,
        );

        H.expectGoodSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "question",
          accessed_via: "public-link",
          export_type: "csv",
        });
      });
    });
  },
);

const waitLoading = () => H.main().findByText("Loading...").should("not.exist");
