const { H } = cy;
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

/** These tests are about the `downloads` flag for public dashboards and questions.
 *  Unless the product changes, these should test the same things as `embed-resource-downloads.cy.spec.ts`
 */

describe("Public dashboards/questions downloads (results and pdf)", () => {
  beforeEach(() => {
    H.resetSnowplow();
    cy.deleteDownloadsFolder();
  });

  describe("Public dashboards", () => {
    let publicLink: string;

    before(() => {
      H.restore("default");
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");

      cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);

      H.openSharingMenu("Create a public link");

      H.popover()
        .findByTestId("public-link-input")
        .should("contain.value", "/public/")
        .invoke("val")
        .then((url) => {
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

      cy.findByRole("button", { name: "Download as PDF" }).should("not.exist");

      // we should not have any dashcard action in a public/embed scenario, so the menu should not be there
      H.getEmbeddedDashboardCardMenu().should("not.exist");
    });

    it("#downloads=pdf should enable only PDF downloads", () => {
      cy.visit(`${publicLink}#downloads=pdf`);
      waitLoading();

      cy.get("header")
        .findByRole("button", { name: "Download as PDF" })
        .should("exist");
      H.getEmbeddedDashboardCardMenu().should("not.exist");
    });

    it("#downloads=results should enable only dashcard results downloads", () => {
      cy.visit(`${publicLink}#downloads=results`);
      waitLoading();

      cy.get("header")
        .findByRole("button", { name: "Download as PDF" })
        .should("not.exist");

      H.main().realHover();
      H.getEmbeddedDashboardCardMenu().click();
      cy.findByLabelText("Download results").should("be.visible");
    });

    it("#downloads=pdf,results should enable both PDF and results downloads", () => {
      cy.visit(`${publicLink}#downloads=pdf,results`);
      waitLoading();

      cy.get("header")
        .findByRole("button", { name: "Download as PDF" })
        .should("exist");

      H.main().realHover();
      H.getEmbeddedDashboardCardMenu().should("exist").click();
      cy.findByLabelText("Download results").should("be.visible");
    });

    it("#downloads=results,pdf should enable both PDF and results downloads (order agnostic)", () => {
      cy.visit(`${publicLink}#downloads=results,pdf`);
      waitLoading();

      cy.get("header")
        .findByRole("button", { name: "Download as PDF" })
        .should("exist");

      H.main().realHover();
      H.getEmbeddedDashboardCardMenu().click();
      cy.findByLabelText("Download results").should("be.visible");
    });

    it("#downloads=results, pdf should handle whitespace between parameters", () => {
      cy.visit(`${publicLink}#downloads=results, pdf`);
      waitLoading();

      cy.get("header")
        .findByRole("button", { name: "Download as PDF" })
        .should("exist");

      H.main().realHover();
      H.getEmbeddedDashboardCardMenu().click();
      cy.findByLabelText("Download results").should("be.visible");
    });

    it("should be able to download a public dashboard as PDF", () => {
      cy.visit(`${publicLink}#downloads=true`);
      waitLoading();

      cy.get("header")
        .findByRole("button", { name: "Download as PDF" })
        .click();

      cy.verifyDownload("Orders in a dashboard.pdf");

      H.expectUnstructuredSnowplowEvent({
        event: "dashboard_pdf_exported",
        dashboard_id: 0,
        dashboard_accessed_via: "public-link",
      });
    });

    it("should be able to download a public dashcard as CSV", () => {
      cy.visit(`${publicLink}`);
      waitLoading();

      const uuid = publicLink.split("/").at(-1);

      H.downloadAndAssert({
        publicUuid: uuid,
        fileType: "csv",
        questionId: ORDERS_BY_YEAR_QUESTION_ID,
        isDashboard: true,
        isEmbed: true,
        dashcardId: ORDERS_DASHBOARD_DASHCARD_ID,
      });

      H.expectUnstructuredSnowplowEvent({
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
      H.activateToken("pro-self-hosted");

      cy.visit(`/question/${ORDERS_BY_YEAR_QUESTION_ID}`);

      H.openSharingMenu("Create a public link");

      H.popover()
        .findByTestId("public-link-input")
        .should("contain.value", "/public/")
        .invoke("val")
        .then((url) => {
          publicLink = url as string;
        });

      cy.signOut();
    });

    it("#downloads=results should enable result downloads", () => {
      cy.visit(`${publicLink}#downloads=results`);
      waitLoading();

      H.main().realHover();
      cy.findByRole("button", { name: "Download results" }).should(
        "be.visible",
      );
    });

    it("#downloads=false should disable result downloads", () => {
      cy.visit(`${publicLink}#downloads=false`);
      waitLoading();

      H.main().realHover();
      cy.findByRole("button", { name: "Download results" }).should("not.exist");
    });

    it("should be able to download the question as PNG", () => {
      cy.visit(`${publicLink}`);
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
        accessed_via: "public-link",
        export_type: "png",
      });
    });

    it("should be able to download a public card as CSV", () => {
      cy.visit(`${publicLink}`);
      waitLoading();

      H.main().realHover();
      cy.findByLabelText("Download results").should("be.visible");

      const uuid = publicLink.split("/").at(-1);

      H.downloadAndAssert({
        publicUuid: uuid,
        fileType: "csv",
        questionId: ORDERS_BY_YEAR_QUESTION_ID,
        isDashboard: false,
        isEmbed: true,
      });

      H.expectUnstructuredSnowplowEvent({
        event: "download_results_clicked",
        resource_type: "question",
        accessed_via: "public-link",
        export_type: "csv",
      });
    });
  });

  describe("Public questions with parameters", () => {
    before(() => {
      H.restore("default");
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");

      H.createNativeQuestion(
        {
          native: {
            query: "SELECT * FROM orders WHERE TOTAL > {{ minimum }}",

            "template-tags": {
              minimum: {
                id: "930e4001",
                name: "minimum",
                "display-name": "Minimum",
                type: "number",
                default: "10",
              },
            },
          },
          parameters: [
            {
              id: "930e4001",
              slug: "minimum",
              name: "minimum",
              type: "number",
              default: 10,
              target: ["variable", ["template-tag", "minimum"]],
            },
          ],
        },
        {
          visitQuestion: true,
        },
      );

      H.openSharingMenu("Create a public link");

      H.popover()
        .findByTestId("public-link-input")
        .should("contain.value", "/public/")
        .invoke("val")
        .then((url) => {
          if (typeof url === "string") {
            cy.signOut();
            cy.visit(url);
          }
        });
    });

    it("should not pass all the parameters to the public link", () => {
      waitLoading();

      H.main().realHover();
      cy.findByLabelText("Download results").should("be.visible");

      cy.location("pathname").then((pathname) => {
        const uuid = pathname.split("/").at(-1);

        H.downloadAndAssert({
          publicUuid: uuid,
          fileType: "csv",
          questionId: ORDERS_BY_YEAR_QUESTION_ID,
          isDashboard: false,
          isEmbed: true,
        });

        cy.get<{ request: Request }>("@fileDownload").then(({ request }) => {
          const url = new URL(request.url);
          const parameters = JSON.parse(
            url.searchParams.get("parameters") ?? "[]",
          );

          cy.wrap(parameters).should("have.length", 1);
          cy.wrap(parameters[0]).should("have.property", "id");
          cy.wrap(parameters[0]).should("have.property", "value");
          cy.wrap(parameters[0]).should("not.have.property", "type");
          cy.wrap(parameters[0]).should("not.have.property", "target");
        });
      });
    });
  });
});

const waitLoading = () => H.main().findByText("Loading...").should("not.exist");
