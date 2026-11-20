const { H } = cy;

function securityCenterContent() {
  return cy.findByTestId("security-center-page");
}

describe("scenarios > admin > security center", { tags: "@EE" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should send a page viewed event and trigger sync when clicking Check now", () => {
    H.resetSnowplow();
    H.enableTracking();
    cy.intercept("POST", "/api/ee/security-center/sync").as("sync");
    cy.visit("/admin/security-center");
    securityCenterContent().within(() => {
      cy.findByText("Security Center").should("be.visible");
    });
    H.expectUnstructuredSnowplowEvent({
      event: "security_center_page_viewed",
    });

    cy.findByTestId("sync-advisories").click();
    cy.wait("@sync");

    H.expectNoBadSnowplowEvents();
  });
});
