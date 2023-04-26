import {
  editDashboard,
  getDashboardCard,
  restore,
  showDashboardCardActions,
} from "e2e/support/helpers";

describe("issue 21830", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("slow loading card visualization options click shouldn't lead to error (metabase#21830)", () => {
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept(
      {
        method: "POST",
        url: "/api/dashboard/*/dashcard/*/card/*/query",
        middleware: true,
      },
      req => {
        req.on("response", res => {
          // throttle the response to simulate a mobile 3G connection
          res.setThrottle(100);
        });
      },
    ).as("getCardQuery");

    cy.visit("/dashboard/1");
    cy.wait("@getDashboard");

    // it's crucial that we try to click on this icon BEFORE we wait for the `getCardQuery` response!
    editDashboard();
    showDashboardCardActions();

    getDashboardCard().within(() => {
      cy.icon("close").should("be.visible");
      cy.icon("click").should("not.exist");
      cy.icon("palette").should("not.exist");
    });

    cy.wait("@getCardQuery");

    getDashboardCard().within(() => {
      cy.icon("close").should("be.visible");
      cy.icon("click").should("be.visible");
      cy.icon("palette").should("be.visible");
    });
  });
});
