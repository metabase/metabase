import {
  restore,
  editDashboard,
  showDashboardCardActions,
} from "__support__/e2e/cypress";

describe.skip("issue 21830", () => {
  beforeEach(() => {
    restore("postgres-12");
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

    cy.icon("palette").click({ force: true });

    cy.wait("@dashcardQuery");

    cy.get(".Modal");
  });
});
