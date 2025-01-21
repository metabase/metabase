import {
  createMockVersionInfo,
  createMockVersionInfoRecord as mockVersion,
} from "metabase-types/api/mocks";

describe("nav > what's new notification", () => {
  beforeEach(() => {
    cy.restore();

    mockVersions({
      currentVersion: "v0.48.0",
      versions: [
        mockVersion({
          version: "v0.48.0",
          announcement_url: "metabase.com/releases/48",
        }),
        mockVersion({
          version: "v0.47.1",
          announcement_url: "metabase.com/releases/47",
        }),
      ],
    });
  });

  it("should show a notification with a link to the release notes, and allow the dismissal of it", () => {
    cy.signInAsAdmin();
    cy.request("PUT", "api/setting/last-acknowledged-version", { value: null });

    loadHomepage();
    cy.navigationSidebar().findByText("See what's new");

    // should persist reloads
    loadHomepage();
    cy.navigationSidebar().findByText("See what's new");

    cy.navigationSidebar().icon("close").click();
    cy.navigationSidebar().findByText("See what's new").should("not.exist");

    loadHomepage();
    cy.navigationSidebar().findByText("See what's new").should("not.exist");
  });

  it("it should show the notification for other users after one user dismissed it", () => {
    cy.signInAsAdmin();
    cy.request("PUT", "api/setting/last-acknowledged-version", { value: null });
    loadHomepage();
    cy.navigationSidebar().findByText("See what's new");
    cy.navigationSidebar().icon("close").click();

    cy.signInAsNormalUser();
    loadHomepage();
    cy.navigationSidebar().findByText("See what's new");
  });
});

function mockVersions({ currentVersion, versions = [] }) {
  const [latest, ...older] = versions;
  cy.intercept("GET", "/api/session/properties", req => {
    req.reply(res => {
      res.body["version"] = { tag: currentVersion };
      res.body["version-info"] = createMockVersionInfo({ latest, older });
    });
  }).as("sessionProperties");
}

function loadHomepage() {
  cy.visit("/");

  cy.wait("@sessionProperties");

  // make sure page is loaded
  cy.findByText("loading").should("not.exist");

  cy.navigationSidebar().findByText("Home").should("exist");
}
