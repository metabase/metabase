import {
  editDashboard,
  getDashboardCard,
  restore,
  showDashboardCardActions,
} from "__support__/e2e/cypress";

describe.skip("issue 21830", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("slow loading card visualization options click shouldn't lead to error (metabase#21830)", () => {
    cy.intercept(
      {
        method: "POST",
        url: "/api/dashboard/*/dashcard/*/card/*/query",
        middleware: true,
      },
      req => {
        req.on("response", res => {
          // Throttle the response to 500 Kbps to simulate a mobile 3G connection
          res.setThrottle(500);
        });
      },
    ).as("dashcardQuery");

    cy.visit("/dashboard/1");

    // It's crucial that we try to click on this icon BEFORE we wait for the `dashcardQuery` response!
    editDashboard();
    showDashboardCardActions();

    getDashboardCard().within(() => {
      cy.icon("close").should("be.visible");
      cy.icon("click").should("not.exist");
      cy.icon("palette").should("not.exist");
    });
  });
});
