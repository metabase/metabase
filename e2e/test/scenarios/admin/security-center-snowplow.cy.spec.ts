const { H } = cy;

describe("Security Center > Snowplow tracking", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
    H.mockSessionPropertiesTokenFeatures({
      "admin-security-center": true,
    });
    // Stub the API so the page renders without a real EE backend
    cy.intercept("GET", "/api/ee/security-center", {
      last_checked_at: null,
      advisories: [],
    });
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
