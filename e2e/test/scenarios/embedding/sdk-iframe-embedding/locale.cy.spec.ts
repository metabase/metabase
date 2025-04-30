import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > locale", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
  });

  it("uses the provided locale", () => {
    cy.signOut();

    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
      locale: "de",
    });

    frame.within(() => {
      cy.findByRole("button", {
        name: "Automatische Aktualisierung",
      }).should("exist");
    });
  });
});
