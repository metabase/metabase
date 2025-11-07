import { completeWizard, navigateToEntitySelectionStep } from "./helpers";

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
    completeWizard({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    H.modal().should("not.exist");
    cy.findAllByTestId("sdk-setting-card").should("be.visible");
  });
});
