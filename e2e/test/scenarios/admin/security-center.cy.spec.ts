const { H } = cy;

const SECURITY_CENTER_URL = "/admin/security-center";
const ADVISORIES_URL = `${SECURITY_CENTER_URL}/advisories`;
const HEALTH_CHECKS_URL = `${SECURITY_CENTER_URL}/health-checks`;

function advisoriesPageContent() {
  return cy.findByTestId("advisories-page");
}

describe("scenarios > admin > security center", { tags: "@EE" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  describe("advisories", () => {
    it("should send a page viewed event and trigger sync when clicking Check now", () => {
      H.resetSnowplow();
      H.enableTracking();
      cy.intercept("POST", "/api/ee/security-center/advisories/sync").as(
        "sync",
      );
      cy.visit(ADVISORIES_URL);
      advisoriesPageContent()
        .findByText("Security advisories")
        .should("be.visible");
      H.expectUnstructuredSnowplowEvent({
        event: "security_center_page_viewed",
      });

      cy.findByTestId("sync-advisories").click();
      cy.wait("@sync");

      H.expectNoBadSnowplowEvents();
    });
  });

  describe("health checks", () => {
    const checkGroup = (name: RegExp) => cy.findByRole("region", { name });

    const openCheckGroup = (name: RegExp) => {
      cy.findByRole("button", { name, expanded: false }).click();
      return checkGroup(name);
    };

    const healthCheckCard = (checkId: string) =>
      cy.findByTestId(`health-check-card-${checkId}`);

    it("should show a failing check and move it to Passed after it is fixed and re-checked", () => {
      H.updateSetting("site-url", "http://localhost:4000");
      cy.visit(HEALTH_CHECKS_URL);

      cy.log("Insecure site URL fails the check");
      checkGroup(/Failing/).within(() => {
        healthCheckCard("https-site-url").should("be.visible");
      });

      cy.log("Fix the setting and re-check");
      H.updateSetting("site-url", "https://metabase.example.com");
      cy.findByRole("button", { name: /Refresh/ }).click();

      cy.log("The check moves to Passed");
      openCheckGroup(/Passed/).within(() => {
        healthCheckCard("https-site-url").should("be.visible");
      });
    });
  });
});
