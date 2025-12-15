import {
  getEmbedSidebar,
  navigateToEntitySelectionStep,
  navigateToGetCodeStep,
} from "./helpers";

const { H } = cy;

const DASHBOARD_NAME = "Orders in a dashboard";

describe("scenarios > embedding > sdk iframe embed setup > common", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();
    H.updateSetting("enable-embedding-simple", true);

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");

    H.mockEmbedJsToDevServer();
  });

  it("should close wizard when clicking `close` button on the modal", () => {
    navigateToEntitySelectionStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    H.modal()
      .first()
      .within(() => {
        cy.get("[aria-label='Close']").click();
      });

    H.modal().should("not.exist");
    cy.findAllByTestId("sdk-setting-card").should("be.visible");
  });

  it("should close wizard when clicking `Done` button on the last step", () => {
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    H.publishChanges("dashboard");

    cy.button("Unpublish").should("be.visible");

    getEmbedSidebar().within(() => {
      cy.findByText("Done").click();
    });

    H.modal().should("not.exist");
    cy.findAllByTestId("sdk-setting-card").should("be.visible");
  });

  it("should close wizard when navigating back in browser history", () => {
    cy.visit("/admin");
    cy.findAllByTestId("settings-sidebar-link")
      .contains("General")
      .should("be.visible");

    cy.visit("/admin/embedding");
    cy.findAllByTestId("sdk-setting-card").should("be.visible");

    cy.findAllByTestId("sdk-setting-card")
      .first()
      .within(() => {
        cy.findByText("New embed").click();
      });

    cy.wait("@dashboard");

    H.embedModalEnableEmbedding();

    cy.get("[data-iframe-loaded]", { timeout: 20000 }).should("have.length", 1);

    H.modal().should("exist");

    cy.go("back");

    H.modal().should("not.exist");
    cy.findAllByTestId("settings-sidebar-link")
      .contains("General")
      .should("be.visible");
  });
});
