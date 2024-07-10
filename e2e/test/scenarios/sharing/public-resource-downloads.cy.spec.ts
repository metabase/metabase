import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  assertNotEmpty,
  describeEE,
  downloadAndAssert,
  getDashboardCardMenu,
  main,
  popover,
  restore,
  setTokenFeatures,
  showDashboardCardActions,
} from "e2e/support/helpers";

describeEE(
  "Public dashboards/questions downloads (results and export as pdf)",
  () => {
    beforeEach(() => {
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
          .invoke("val")
          .then(url => {
            // cy.wrap(url).as("publicLink");
            publicLink = url as string;
          });

        cy.signOut();
      });

      it("#downloads=false should disable both PDF downloads and dashcard results downloads", () => {
        cy.visit(`${publicLink}#downloads=false`);
        waitLoading();

        // eslint-disable-next-line no-unscoped-text-selectors -- this should not appear anywhere in the page
        cy.findByText("Export as PDF").should("not.exist");

        // we should not have any dashcard action in a public/embed scenario, so the menu should not be there
        getDashboardCardMenu().should("not.exist");
      });

      it("should be able to disable dashcard result downloads with #downloads=false", () => {
        cy.visit(`${publicLink}#downloads=false`);
        waitLoading();

        // eslint-disable-next-line no-unscoped-text-selectors -- this should not appear anywhere in the page
        cy.findByText("Export as PDF").should("not.exist");
      });

      it("should be able to download a public dashboard as PDF", () => {
        cy.visit(`${publicLink}#downloads=true`);
        waitLoading();

        cy.get("header").findByText("Export as PDF").click();

        cy.verifyDownload("Orders in a dashboard.pdf");
      });

      it("should be able to download a public dashcard as CSV", () => {
        cy.visit(`${publicLink}`);
        waitLoading();

        showDashboardCardActions();

        const uuid = publicLink.split("/").at(-1);

        downloadAndAssert(
          {
            publicUid: uuid,
            fileType: "csv",
            questionId: ORDERS_QUESTION_ID,
            isDashboard: true,
            dashcardId: ORDERS_DASHBOARD_DASHCARD_ID,
          },
          assertNotEmpty,
        );
      });
    });
  },
);

const waitLoading = () => main().findByText("Loading...").should("not.exist");
