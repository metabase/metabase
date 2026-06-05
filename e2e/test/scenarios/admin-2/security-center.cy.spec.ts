const { H } = cy;

const ADVISORIES = {
  critical: {
    advisory_id: "TEST-001",
    severity: "critical",
    title: "Critical RCE vulnerability",
    description: "Remote code execution via crafted input.",
    remediation: "Upgrade to 0.59.5",
    advisory_url: "https://example.com/advisory/TEST-001",
    affected_versions: [{ min: "0.58.0", fixed: "0.59.5" }],
    match_status: "active",
    published_at: "2026-03-20T00:00:00Z",
    updated_at: "2026-03-20T00:00:00Z",
  },
  high: {
    advisory_id: "TEST-002",
    severity: "high",
    title: "SQL injection in query builder",
    description: "Postgres databases are vulnerable to SQL injection.",
    remediation: "Upgrade to 0.58.8",
    affected_versions: [{ min: "0.54.0", fixed: "0.58.8" }],
    match_status: "resolved",
    published_at: "2026-03-15T00:00:00Z",
    updated_at: "2026-03-15T00:00:00Z",
  },
  medium: {
    advisory_id: "TEST-003",
    severity: "medium",
    title: "SSRF in GeoJSON endpoint",
    description: "Custom GeoJSON endpoints can be used for SSRF.",
    remediation: "Upgrade to 0.58.7",
    affected_versions: [{ min: "0.50.0", fixed: "0.58.7" }],
    match_status: "not_affected",
    published_at: "2026-03-10T00:00:00Z",
    updated_at: "2026-03-10T00:00:00Z",
  },
} as const;

function seedAllAdvisories() {
  H.seedSecurityAdvisories([
    ADVISORIES.critical,
    ADVISORIES.high,
    ADVISORIES.medium,
  ]);
}

function securityCenterContent() {
  return cy.findByTestId("security-center-page");
}

describe("scenarios > admin > security center", { tags: "@EE" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should gate the security center behind a valid token and show empty state without advisories", () => {
    // Without a token the page should not render
    H.deleteToken();
    cy.visit("/admin/security-center");
    cy.findByTestId("security-center-page").should("not.exist");

    // Re-activate the token (no advisories seeded) → empty state
    H.activateToken("pro-self-hosted");
    cy.visit("/admin/security-center");
    securityCenterContent().within(() => {
      cy.findByText(/No known security issues/).should("be.visible");
    });
  });

  it("should display advisory cards sorted by affected status and severity, and support filtering", () => {
    seedAllAdvisories();
    cy.visit("/admin/security-center");
    securityCenterContent().within(() => {
      cy.findByText("Security Center").should("be.visible");
      cy.findByTestId("current-version").should("be.visible");
    });

    // All three advisory cards are visible
    cy.findAllByTestId("advisory-card").should("have.length", 3);
    securityCenterContent().within(() => {
      cy.findByText("Critical RCE vulnerability").should("be.visible");
      cy.findByText("SQL injection in query builder")
        .scrollIntoView()
        .should("be.visible");
      cy.findByText("SSRF in GeoJSON endpoint")
        .scrollIntoView()
        .should("be.visible");
    });

    // Affected/critical advisory is sorted first
    cy.findAllByTestId("advisory-card")
      .first()
      .within(() => {
        cy.findByText("Critical RCE vulnerability").should("exist");
      });

    // Filter by severity
    cy.findByTestId("severity-filter").click();
    cy.findByRole("option", { name: "Critical" }).click();
    cy.findAllByTestId("advisory-card").should("have.length", 1);
    securityCenterContent().within(() => {
      cy.findByText("Critical RCE vulnerability").should("be.visible");
    });

    // Clear severity filter (re-select to deselect)
    cy.findByTestId("severity-filter").click();
    cy.findByRole("option", { name: "All severities" }).click();
    cy.findAllByTestId("advisory-card").should("have.length", 3);
  });

  it("should dismiss individual advisories, dismiss all, and toggle dismissed visibility", () => {
    seedAllAdvisories();
    cy.visit("/admin/security-center");
    securityCenterContent().within(() => {
      cy.findByText("Security Center").should("be.visible");
    });

    cy.intercept("POST", "/api/ee/security-center/*/acknowledge").as(
      "acknowledge",
    );

    // Dismiss the first advisory
    cy.findAllByTestId("advisory-card")
      .first()
      .findByTestId("acknowledge-button")
      .click();
    cy.wait("@acknowledge");

    // Dismissed card is hidden by default
    cy.findAllByTestId("advisory-card").should("have.length", 2);

    // Toggle to show dismissed — card reappears with "Dismissed" badge
    cy.findByTestId("show-acknowledged-filter").click();
    cy.findAllByTestId("advisory-card").should("have.length", 3);
    cy.findAllByTestId("advisory-card")
      .first()
      .findByTestId("acknowledge-button")
      .should("have.text", "Dismissed");

    // Hide dismissed again before testing "Dismiss all"
    cy.findByTestId("show-acknowledged-filter").click();
    cy.findAllByTestId("advisory-card").should("have.length", 2);

    // Dismiss all non-affecting advisories
    cy.intercept("POST", "/api/ee/security-center/acknowledge").as(
      "acknowledgeAll",
    );
    securityCenterContent().findByText("Dismiss all").click();
    cy.wait("@acknowledgeAll").then(({ request }) => {
      expect(request.body.advisory_ids).to.include("TEST-002");
      expect(request.body.advisory_ids).to.include("TEST-003");
      expect(request.body.advisory_ids).to.not.include("TEST-001");
    });

    // "Dismiss all" button disappears when no non-affecting advisories remain
    securityCenterContent().findByText("Dismiss all").should("not.exist");
  });

  it("should show nav item with badge and navigate to the security center", () => {
    seedAllAdvisories();
    cy.visit("/admin");

    // Nav item and badge are visible
    cy.findByTestId("admin-navbar").within(() => {
      cy.findByText("Security").should("be.visible");
    });
    cy.findByTestId("security-center-badge").should("be.visible");

    // Clicking navigates to security center
    cy.findByTestId("admin-navbar").within(() => {
      cy.findByText("Security").click();
    });
    cy.url().should("include", "/admin/security-center");
    securityCenterContent().within(() => {
      cy.findByText("Security Center").should("be.visible");
    });
  });

  it("should open notification settings modal, show Slack state, save settings, and default admin toggle with SMTP", () => {
    seedAllAdvisories();
    H.setupSMTP();
    cy.visit("/admin/security-center");
    securityCenterContent().within(() => {
      cy.findByText("Security Center").should("be.visible");
    });

    // Open modal and verify contents
    cy.findByTestId("notification-config-toggle").click();
    H.modal().within(() => {
      cy.findByText("Notification settings").should("be.visible");
      cy.findByText("Email").should("be.visible");
      cy.findByText("Slack").should("be.visible");
      cy.findByText("Slack is not configured.").should("be.visible");
      cy.findByText("Set up Slack").should("be.visible");
    });

    // Send-to-all-admins toggle is checked by default when SMTP is configured
    cy.findByTestId("send-to-admins-toggle").should("be.checked");

    // Save settings
    cy.intercept("PUT", "/api/setting").as("saveSettings");
    cy.findByRole("button", { name: "Save" }).click();
    cy.wait("@saveSettings").then(({ request }) => {
      expect(request.body).to.have.property("security-center-email-recipients");
    });
  });

  it("should trigger sync when clicking Check now", () => {
    cy.intercept("POST", "/api/ee/security-center/sync").as("sync");
    cy.visit("/admin/security-center");
    securityCenterContent().within(() => {
      cy.findByText("Security Center").should("be.visible");
    });

    cy.findByTestId("sync-advisories").click();
    cy.wait("@sync");
  });
});
