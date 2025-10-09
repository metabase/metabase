const { H } = cy;

const SYNCED_COLLECTION_NAME = "Remote Sync Test Collection";
const LOCAL_GIT_PATH = Cypress.config("projectRoot") + "/e2e/tmp/test-repo";
const LOCAL_GIT_URL = "file://" + LOCAL_GIT_PATH + "/.git";

function configureGit(syncType: "development" | "production") {
  cy.request("PUT", "/api/ee/remote-sync/settings", {
    "remote-sync-branch": "main",
    "remote-sync-type": syncType,
    "remote-sync-url": "file://" + LOCAL_GIT_PATH,
    "remote-sync-enabled": true,
  });
}

function setupGitSync() {
  H.restore();
  cy.exec("rm -rf " + LOCAL_GIT_PATH);
  cy.exec("git init " + LOCAL_GIT_PATH);
  cy.exec(
    "git -C " + LOCAL_GIT_PATH + " commit --allow-empty -m 'Initial Commit'",
  );

  cy.signInAsAdmin();
  H.activateToken("bleeding-edge");

  configureGit("production");
  H.snapshot("remote-sync-setup");
}

function cleanupGitSync() {}

xdescribe("Remote Sync", () => {
  before(() => {
    setupGitSync();
  });

  after(() => {
    cleanupGitSync();
  });

  describe("remote sync admin settings page", () => {
    it("can set up development mode", () => {
      cy.signInAsAdmin();
      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type(LOCAL_GIT_URL);
      cy.findByLabelText(/access token/i)
        .clear()
        .type("local repo doesn't use");
      cy.findByTestId("admin-layout-content").findByText("Development").click();
      cy.button("Save changes").click();
      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");
    });

    it("can set up production mode", () => {
      cy.signInAsAdmin();
      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type(LOCAL_GIT_URL);
      cy.findByLabelText(/access token/i)
        .clear()
        .type("local repo doesn't use");
      cy.findByTestId("admin-layout-content").findByText("Production").click();
      cy.button("Save changes").click();
      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");
    });

    it("shows an error if git settings are invalid", () => {
      cy.signInAsAdmin();
      cy.intercept("PUT", "/api/ee/remote-sync/settings").as("saveSettings");
      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type("file://invalid-path");
      cy.button("Save changes").click();

      cy.wait("@saveSettings").its("response.statusCode").should("eq", 400);
      cy.findByTestId("admin-layout-content")
        .findByText("Failed")
        .should("exist");
      cy.findByTestId("admin-layout-content")
        .findByText("Invalid git settings")
        .should("exist");
    });

    it("manage collections to sync in dev mode", () => {
      cy.signInAsAdmin();
      configureGit("development");
      cy.visit("/admin/settings/remote-sync");
      H.createCollection({ name: SYNCED_COLLECTION_NAME });

      // add collection
      cy.intercept("PUT", "/api/collection/*").as("saveCollection");
      cy.findByTestId("admin-layout-content")
        .findByPlaceholderText(/add a collection to sync/i)
        .click();

      H.popover().findByText(SYNCED_COLLECTION_NAME).click();

      cy.findByTestId("admin-layout-content")
        .findByText(SYNCED_COLLECTION_NAME)
        .should("exist");
      cy.wait("@saveCollection")
        .its("request.body.type")
        .should("eq", "remote-synced");

      //remove collection
      cy.intercept("PUT", "/api/collection/*").as("removeCollection");
      cy.findByTestId("admin-layout-content").within(() => {
        cy.icon("close").click();
      });
      cy.findByTestId("admin-layout-content")
        .findByText(SYNCED_COLLECTION_NAME)
        .should("not.exist");
      cy.wait("@removeCollection").its("request.body.type").should("eq", null);
    });
  });

  describe("Synchronizing changes", () => {
    before(() => {
      configureGit("development");
    });

    it("Changes pushed to a branch can be imported to a branch", () => {
      cy.signInAsAdmin();
      H.createCollection({ name: SYNCED_COLLECTION_NAME });
    });
  });

  it("can export changes to git", () => {
    setupGitSync();
    H.createQuestion({
      name: "Remote Sync Test Question",
    });
  });

  it("can set up development mode", () => {
    H.createCollection({ name: SYNCED_COLLECTION_NAME });
    cy.visit("/admin/settings/remote-sync");
    cy.findByLabelText(/repository url/i).type(LOCAL_GIT_URL);
    cy.findByLabelText(/access token/i).type("local repo doesn't use");
    cy.findByTestId("admin-layout-content").findByText("Development").click();
    cy.findByLabelText(/sync branch/i)
      .clear()
      .type("main");
    cy.button("Save changes").click();
  });

  it("can import changes from git", () => {});
});
