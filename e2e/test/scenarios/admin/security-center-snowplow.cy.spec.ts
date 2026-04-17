const { H } = cy;
const { IS_ENTERPRISE } = Cypress.env();

describe("Security Center > Snowplow tracking", { tags: "@enterprise" }, () => {
  before(() => {
    if (!IS_ENTERPRISE) {
      cy.log("Skipping — requires EE build");
      return;
    }
  });

  beforeEach(function () {
    if (!IS_ENTERPRISE) {
      this.skip();
    }
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
    H.activateToken("pro-self-hosted");
    // Stub the API so the page renders without a real EE backend
    cy.intercept("GET", "/api/ee/security-center", {
      last_checked_at: null,
      advisories: [],
    });
    cy.intercept("GET", "/api/user/recipients", { data: [] });
    cy.intercept("GET", "/api/channel", { channels: {} });
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should send a page viewed event when visiting the security center", () => {
    cy.visit("/admin/security-center");
    cy.findByRole("heading", { name: "Security Center" });
    H.expectUnstructuredSnowplowEvent({
      event: "security_center_page_viewed",
    });
  });
});
