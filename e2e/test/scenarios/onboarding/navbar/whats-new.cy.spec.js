import { navigationSidebar, restore } from "e2e/support/helpers";
import {
  createMockVersionInfo,
  createMockVersionInfoRecord as mockVersion,
} from "metabase-types/api/mocks";

describe("nav > what's new notification", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    mockVersions({
      currentVersion: "v0.48.0",
      versions: [
        mockVersion({
          version: "v0.48.0",
          releaseNotesUrl: "metabase.com/releases/48",
        }),
        mockVersion({
          version: "v0.47.1",
          releaseNotesUrl: "metabase.com/releases/47",
        }),
      ],
    });
  });

  // replace `skip` with `only` to manually test this feature with the mocks set up
  it.skip("mock setup for manual tests", () => {
    loadHomepage();

    navigationSidebar().findByText("See what's new");

    cy.pause();
  });

  it("should show a notification with a link to the release notes, and allow the dismissal of it", () => {
    loadHomepage();

    navigationSidebar().findByText("See what's new");

    navigationSidebar().icon("close").click();

    navigationSidebar().findByText("See what's new").should("not.exist");

    loadHomepage();

    navigationSidebar().findByText("See what's new").should("not.exist");
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

  // make sure page is loaded
  cy.findByText("loading").should("not.exist");
  cy.wait("@sessionProperties");

  navigationSidebar().findByText("Home").should("exist");
}
