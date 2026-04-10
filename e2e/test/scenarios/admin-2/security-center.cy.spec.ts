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

  describe("feature gating", () => {
    it("should not show security center without a valid token", () => {
      H.deleteToken();
      cy.visit("/admin/security-center");
      cy.findByTestId("security-center-page").should("not.exist");
    });

    it("should render the security center page with a valid token", () => {
      seedAllAdvisories();
      cy.visit("/admin/security-center");
      securityCenterContent().within(() => {
        cy.findByText("Security Center").should("be.visible");
        cy.findByTestId("current-version").should("be.visible");
      });
    });
  });

  describe("advisory list", () => {
    beforeEach(() => {
      seedAllAdvisories();
      cy.visit("/admin/security-center");
      securityCenterContent().within(() => {
        cy.findByText("Security Center").should("be.visible");
      });
    });

    it("should display advisory cards with severity and affected status", () => {
      cy.findAllByTestId("advisory-card").should("have.length", 3);
      securityCenterContent().within(() => {
        cy.findByText("Critical RCE vulnerability").should("be.visible");
        cy.findByText("SQL injection in query builder").should("be.visible");
        cy.findByText("SSRF in GeoJSON endpoint")
          .scrollIntoView()
          .should("be.visible");
      });
    });

    it("should sort advisories with affected first, then by severity", () => {
      cy.findAllByTestId("advisory-card")
        .first()
        .within(() => {
          cy.findByText("Critical RCE vulnerability").should("exist");
          cy.findByTestId("affected-status").should("have.text", "Affected");
        });
    });

    it("should show empty state when no advisories exist", () => {
      // Don't seed any — restore already cleared them
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      cy.visit("/admin/security-center");
      securityCenterContent().within(() => {
        cy.findByText(/up to date/).should("be.visible");
      });
    });
  });

  describe("filtering", () => {
    beforeEach(() => {
      seedAllAdvisories();
      cy.visit("/admin/security-center");
      securityCenterContent().within(() => {
        cy.findByText("Security Center").should("be.visible");
      });
    });

    it("should filter by severity", () => {
      cy.findByTestId("severity-filter").click();
      cy.findByRole("option", { name: "Critical" }).click();
      cy.findAllByTestId("advisory-card").should("have.length", 1);
      securityCenterContent().within(() => {
        cy.findByText("Critical RCE vulnerability").should("be.visible");
      });
    });

    it("should filter by affected status", () => {
      cy.findByTestId("status-filter").click();
      cy.findByRole("option", { name: "Affected" }).click();
      cy.findAllByTestId("advisory-card").should("have.length", 1);
      securityCenterContent().within(() => {
        cy.findByText("Critical RCE vulnerability").should("be.visible");
      });
    });

    it("should toggle show dismissed", () => {
      // Dismiss the critical advisory first
      cy.findAllByTestId("advisory-card")
        .first()
        .findByTestId("acknowledge-button")
        .click();

      // It should be hidden by default (dismissed are hidden)
      cy.findAllByTestId("advisory-card").should("have.length", 2);

      // Show dismissed
      cy.findByTestId("show-acknowledged-filter").click();
      cy.findAllByTestId("advisory-card").should("have.length", 3);
    });
  });

  describe("dismiss advisory", () => {
    beforeEach(() => {
      seedAllAdvisories();
      cy.visit("/admin/security-center");
      securityCenterContent().within(() => {
        cy.findByText("Security Center").should("be.visible");
      });
    });

    it("should dismiss an advisory and show the badge", () => {
      cy.intercept("POST", "/api/ee/security-center/*/acknowledge").as(
        "acknowledge",
      );

      cy.findAllByTestId("advisory-card")
        .first()
        .findByTestId("acknowledge-button")
        .click();

      cy.wait("@acknowledge");

      cy.findByTestId("show-acknowledged-filter").click();
      cy.findAllByTestId("advisory-card")
        .first()
        .findByTestId("acknowledged-badge")
        .should("have.text", "Dismissed");
    });

    it("should hide dismissed advisories by default", () => {
      cy.findAllByTestId("advisory-card")
        .first()
        .findByTestId("acknowledge-button")
        .click();

      // After dismissing, the card should disappear
      cy.findAllByTestId("advisory-card").should("have.length", 2);
    });
  });

  describe("navigation and badge", () => {
    it("should show Security nav item with badge when active advisories exist", () => {
      seedAllAdvisories();
      cy.visit("/admin/security-center");
      cy.findByTestId("admin-navbar").within(() => {
        cy.findByText("Security").should("be.visible");
      });
      cy.findByTestId("security-center-badge").should("be.visible");
    });

    it("should navigate to security center when clicking nav item", () => {
      seedAllAdvisories();
      cy.visit("/admin");
      cy.findByTestId("admin-navbar").within(() => {
        cy.findByText("Security").click();
      });
      cy.url().should("include", "/admin/security-center");
      securityCenterContent().within(() => {
        cy.findByText("Security Center").should("be.visible");
      });
    });
  });

  describe("notification settings modal", () => {
    beforeEach(() => {
      seedAllAdvisories();
      cy.visit("/admin/security-center");
      securityCenterContent().within(() => {
        cy.findByText("Security Center").should("be.visible");
      });
    });

    it("should open the notification settings modal", () => {
      cy.findByTestId("notification-config-toggle").click();
      H.modal().within(() => {
        cy.findByText("Notification settings").should("be.visible");
        cy.findByText("Email").should("be.visible");
        cy.findByText("Slack").should("be.visible");
      });
    });

    it("should show send-to-all-admins toggle checked by default", () => {
      H.setupSMTP();
      cy.visit("/admin/security-center");
      securityCenterContent().within(() => {
        cy.findByText("Security Center").should("be.visible");
      });
      cy.findByTestId("notification-config-toggle").click();
      cy.findByTestId("send-to-admins-toggle").should("be.checked");
    });

    it("should show Slack not configured state", () => {
      cy.findByTestId("notification-config-toggle").click();
      H.modal().within(() => {
        cy.findByText("Slack is not configured.").should("be.visible");
        cy.findByText("Set up Slack").should("be.visible");
      });
    });

    it("should save notification settings", () => {
      cy.intercept("PUT", "/api/setting").as("saveSettings");

      cy.findByTestId("notification-config-toggle").click();
      cy.findByRole("button", { name: "Save" }).click();

      cy.wait("@saveSettings").then(({ request }) => {
        expect(request.body).to.have.property(
          "security-center-email-recipients",
        );
      });
    });
  });

  describe("sync", () => {
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
});
