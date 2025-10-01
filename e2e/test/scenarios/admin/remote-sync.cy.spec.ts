const { H } = cy;

function setupGitSync() {
  H.restore();
  cy.signInAsAdmin();
  H.activateToken("bleeding-edge");
  cy.request("POST", "/api/ee/remote-sync/settings", {
    "remote-sync-branch": "main",
    "remote-sync-type": "development",
    "remote-sync-url": "./my-stuff",
    "remote-sync-enabled": true,
  });
  H.snapshot("remote-sync-setup");
}

const SYNCED_COLLECTION_NAME = "Remote Sync Test Collection";

describe("Remote Sync", () => {
  before(() => {
    setupGitSync();
  });

  it("can set up remote sync", () => {
    H.createCollection({ name: SYNCED_COLLECTION_NAME });
    cy.visit("/admin/settings/remote-sync");
    // How to test off a local git repo?
    cy.findByLabelText(/repository url/i).type("./my-repo/.git");
    cy.findByTestId("admin-layout-content").findByText("Production").click();
    cy.button("Set Up Git Sync").click();
    // add collection
    cy.findByTestId("admin-layout-content")
      .findByText(/add a collection to sync/i)
      .click();
    H.popover().findByText(SYNCED_COLLECTION_NAME).click();
  });

  it("can export changes to git", () => {
    setupGitSync();
    H.createQuestion({
      name: "Remote Sync Test Question",
    });
  });

  it("can import changes from git", () => {});
});
