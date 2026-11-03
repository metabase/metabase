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

const SECURITY_CENTER_URL = "/admin/security-center";
const ADVISORIES_URL = `${SECURITY_CENTER_URL}/advisories`;
const HEALTH_CHECKS_URL = `${SECURITY_CENTER_URL}/health-checks`;

function seedAllAdvisories() {
  H.seedSecurityAdvisories([
    ADVISORIES.critical,
    ADVISORIES.high,
    ADVISORIES.medium,
  ]);
}

function securityCenterNav() {
  return cy.findByTestId("security-center-nav");
}

function advisoriesPageContent() {
  return cy.findByTestId("advisories-page");
}

describe("scenarios > admin > security center", { tags: "@EE" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should gate the security center behind a valid token", () => {
    cy.log("Without a token the page does not render");
    H.deleteToken();
    cy.visit(SECURITY_CENTER_URL);
    cy.findByTestId("admin-navbar").should("be.visible");
    securityCenterNav().should("not.exist");

    cy.log("With a token the security center opens");
    H.activateToken("pro-self-hosted");
    cy.visit(SECURITY_CENTER_URL);
    securityCenterNav().should("be.visible");
  });

  describe("advisories", () => {
    it("should show empty state without advisories", () => {
      cy.visit(ADVISORIES_URL);
      advisoriesPageContent()
        .findByText(/No known security issues/)
        .should("be.visible");
    });

    it("should display advisory cards sorted by affected status and severity, and support filtering", () => {
      seedAllAdvisories();
      cy.visit(ADVISORIES_URL);
      advisoriesPageContent().within(() => {
        cy.findByText("Security advisories").should("be.visible");
        cy.findByTestId("current-version").should("be.visible");
      });

      cy.log("All three advisory cards are visible");
      cy.findAllByTestId("advisory-card").should("have.length", 3);
      advisoriesPageContent().within(() => {
        cy.findByText("Critical RCE vulnerability").should("be.visible");
        cy.findByText("SQL injection in query builder")
          .scrollIntoView()
          .should("be.visible");
        cy.findByText("SSRF in GeoJSON endpoint")
          .scrollIntoView()
          .should("be.visible");
      });

      cy.log("Affected critical advisory is sorted first");
      cy.findAllByTestId("advisory-card")
        .first()
        .findByText("Critical RCE vulnerability")
        .should("be.visible");

      cy.log("Filter by severity");
      cy.findByTestId("severity-filter").click();
      cy.findByRole("option", { name: "Critical" }).click();
      cy.findAllByTestId("advisory-card").should("have.length", 1);
      advisoriesPageContent()
        .findByText("Critical RCE vulnerability")
        .should("be.visible");

      cy.log("Clear severity filter");
      cy.findByTestId("severity-filter").click();
      cy.findByRole("option", { name: "All severities" }).click();
      cy.findAllByTestId("advisory-card").should("have.length", 3);
    });

    it("should dismiss individual advisories, dismiss all, and toggle dismissed visibility", () => {
      seedAllAdvisories();
      cy.visit(ADVISORIES_URL);
      advisoriesPageContent()
        .findByText("Security advisories")
        .should("be.visible");

      cy.intercept("POST", "/api/ee/security-center/*/acknowledge").as(
        "acknowledge",
      );

      cy.log("Dismiss the first advisory");
      cy.findAllByTestId("advisory-card")
        .first()
        .findByTestId("acknowledge-button")
        .click();
      cy.wait("@acknowledge");

      cy.log("Dismissed card is hidden by default");
      cy.findAllByTestId("advisory-card").should("have.length", 2);

      cy.log("Show dismissed: the card reappears with a Dismissed badge");
      cy.findByTestId("show-acknowledged-filter").click();
      cy.findAllByTestId("advisory-card").should("have.length", 3);
      cy.findAllByTestId("advisory-card")
        .first()
        .findByTestId("acknowledge-button")
        .should("have.text", "Dismissed");

      cy.log("Hide dismissed again");
      cy.findByTestId("show-acknowledged-filter").click();
      cy.findAllByTestId("advisory-card").should("have.length", 2);

      cy.log("Dismiss all non-affecting advisories");
      cy.intercept("POST", "/api/ee/security-center/acknowledge").as(
        "acknowledgeAll",
      );
      advisoriesPageContent().findByText("Dismiss all").click();
      cy.wait("@acknowledgeAll").then(({ request }) => {
        expect(request.body.advisory_ids).to.include("TEST-002");
        expect(request.body.advisory_ids).to.include("TEST-003");
        expect(request.body.advisory_ids).to.not.include("TEST-001");
      });

      cy.log("Dismiss all disappears when nothing non-affecting is left");
      advisoriesPageContent().findByText("Dismiss all").should("not.exist");
    });

    it("should open notification settings modal, show Slack state, save settings, and default admin toggle with SMTP", () => {
      seedAllAdvisories();
      H.setupSMTP();
      cy.visit(ADVISORIES_URL);
      advisoriesPageContent()
        .findByText("Security advisories")
        .should("be.visible");

      cy.findByTestId("notification-config-toggle").click();
      H.modal().within(() => {
        cy.findByText("Notification settings").should("be.visible");
        cy.findByText("Email").should("be.visible");
        cy.findByText("Slack").should("be.visible");
        cy.findByText("Slack is not configured.").should("be.visible");
        cy.findByText("Set up Slack").should("be.visible");
      });

      cy.log("Send to all admins is on by default when SMTP is configured");
      cy.findByTestId("send-to-admins-toggle").should("be.checked");

      cy.intercept("PUT", "/api/setting").as("saveSettings");
      cy.findByRole("button", { name: "Save" }).click();
      cy.wait("@saveSettings").then(({ request }) => {
        expect(request.body).to.have.property(
          "security-center-email-recipients",
        );
      });
    });

    it("should send a page viewed event and trigger sync when clicking Check now", () => {
      H.resetSnowplow();
      H.enableTracking();
      cy.intercept("POST", "/api/ee/security-center/sync").as("sync");
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

    describe("per-version download link", () => {
      const DOWNLOADABLE_ADVISORY = {
        advisory_id: "TEST-DL",
        severity: "critical",
        title: "Critical bug with a downloadable fix",
        description: "A critical issue shipping a per-version JAR fix.",
        remediation: "Upgrade to the patched release",
        affected_versions: [{ min: "0.58.0", fixed: "0.59.11" }],
        download_jar_urls: [
          { version: "0.58.11", url: "https://downloads.example.com/58.jar" },
          { version: "0.59.11", url: "https://downloads.example.com/59.jar" },
        ],
        match_status: "active",
        published_at: "2026-03-24T00:00:00Z",
        updated_at: "2026-03-24T00:00:00Z",
      } as const;

      it("stores download_jar_urls and shows a single download button for the fix matching the instance major version", () => {
        H.mockSessionProperty("version", { tag: "v0.59.3" });
        H.seedSecurityAdvisories([DOWNLOADABLE_ADVISORY]);

        cy.log("The backend stores and returns download_jar_urls");
        cy.request("GET", "/api/ee/security-center").then(({ body }) => {
          const advisory = body.advisories.find(
            (a: { advisory_id: string }) => a.advisory_id === "TEST-DL",
          );
          expect(advisory.download_jar_urls).to.deep.equal([
            { version: "0.58.11", url: "https://downloads.example.com/58.jar" },
            { version: "0.59.11", url: "https://downloads.example.com/59.jar" },
          ]);
        });

        cy.visit(ADVISORIES_URL);

        cy.findAllByTestId("advisory-card")
          .first()
          .within(() => {
            cy.findByRole("link", { name: /Download v0\.59\.11/ })
              .should(
                "have.attr",
                "href",
                "https://downloads.example.com/59.jar",
              )
              .and("have.attr", "target", "_blank");
            cy.findByText("Download v0.58.11").should("not.exist");
          });
      });
    });
  });

  describe("health checks", () => {
    const siteUrlCheck = () =>
      cy.findByTestId("health-check-card-https-site-url");

    const checkGroup = (name: RegExp) => cy.findByRole("region", { name });

    it("should show a failing check and move it to Passed after it is fixed and re-checked", () => {
      H.updateSetting("site-url", "http://localhost:4000");
      cy.visit(HEALTH_CHECKS_URL);

      cy.log("Insecure site URL fails the check");
      cy.findByTestId("health-checks-page")
        .findByText(/checks pass/)
        .should("be.visible");
      checkGroup(/Failing/)
        .findByTestId("health-check-card-https-site-url")
        .should("be.visible");

      cy.log("Fix the setting and re-check");
      H.updateSetting("site-url", "https://metabase.example.com");
      siteUrlCheck()
        .findByRole("button", { name: /Re-check/ })
        .click();

      cy.log("The check moves to Passed");
      cy.findByRole("button", { name: /Passed/ }).click();
      checkGroup(/Passed/)
        .findByTestId("health-check-card-https-site-url")
        .should("be.visible");
    });
  });
});
