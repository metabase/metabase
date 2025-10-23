import yamljs from "yamljs";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Collection } from "metabase-types/api";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

const SYNCED_COLLECTION_NAME = "Remote Sync Test Collection";
const LOCAL_GIT_PATH = Cypress.config("projectRoot") + "/e2e/tmp/test-repo";
const LOCAL_GIT_URL = "file://" + LOCAL_GIT_PATH + "/.git";

function configureGit(syncType: "development" | "production") {
  cy.request("PUT", "/api/ee/remote-sync/settings", {
    "remote-sync-branch": "main",
    "remote-sync-type": syncType,
    "remote-sync-url": LOCAL_GIT_URL,
    "remote-sync-enabled": true,
  });
}

// This is a bit strange, but when working locally we write directly to the .git folder, not the working
// directory. git will see an empty working directory and assume we have deleted files, so by stashing
// unstaged changes, we will reset the working directory to what is in the .git folder
const resetRepo = () => {
  cy.exec("git -C " + LOCAL_GIT_PATH + " add .");
  cy.exec("git -C " + LOCAL_GIT_PATH + " stash");
};

const wrapLibraryFiles = () => {
  resetRepo();
  cy.task("readDirectory", LOCAL_GIT_PATH).then((files) => {
    cy.wrap(
      (files as string[]).filter(
        (file: string) => !file.includes(".git") && file.includes(".yaml"),
      ),
    ).as("libraryFiles");
  });
};

const wrapLibraryCollection = (n = 0) => {
  if (n > 3) {
    throw new Error("Could not find library colleciton");
  }

  cy.request("/api/collection").then(({ body: collections }) => {
    const libraryCollection = collections.find(
      (c: Collection) => c.type === "remote-synced",
    );

    if (libraryCollection) {
      cy.wrap(libraryCollection).as("library");
    } else {
      cy.wait(500);
      wrapLibraryCollection(n + 1);
    }
  });
};

function setupGitSync() {
  H.restore();
  cy.exec("rm -rf " + LOCAL_GIT_PATH);
  cy.exec("git init " + LOCAL_GIT_PATH);
  cy.exec(
    "git -C " + LOCAL_GIT_PATH + " commit --allow-empty -m 'Initial Commit'",
  );

  cy.signInAsAdmin();
  H.activateToken("bleeding-edge");

  configureGit("development");

  wrapLibraryCollection();
}

describe("Remote Sync", () => {
  before(() => {
    setupGitSync();
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
    const REMOTE_QUESTION_NAME = "Remote Sync Test Question";

    const UPDATED_REMOTE_QUESTION_NAME = "Updated Question Name";

    cy.get("@library").then((libraryCollection) => {
      H.createQuestion({
        name: REMOTE_QUESTION_NAME,
        query: {
          "source-table": PRODUCTS_ID,
        },
        collection_id: (libraryCollection as unknown as Collection)
          .id as number,
      });
    });

    cy.visit("/");

    // Ensure that status icon is present
    cy.findByTestId("main-navbar-root")
      .findByRole("link", { name: /Library/ })
      .findByTestId("remote-sync-status")
      .should("exist");
    cy.findByTestId("main-navbar-root")
      .findByRole("link", { name: /Library/ })
      .click();

    H.collectionTable().findByText(REMOTE_QUESTION_NAME).should("exist");

    cy.findByTestId("main-navbar-root")
      .findByRole("button", { name: "Push to Git" })
      .click();

    H.modal()
      .button(/Push changes/)
      .click();

    cy.findByTestId("main-navbar-root")
      .findByRole("link", { name: /Library/ })
      .findByTestId("remote-sync-status", { timeout: 10000 })
      .should("not.exist");

    resetRepo();

    wrapLibraryFiles();

    cy.get("@libraryFiles").then((libraryFiles) => {
      const questionFilePath = (libraryFiles as unknown as string[]).find(
        (file) => file.includes("remote_sync_test_question.yaml"),
      );

      const fullPath = `${LOCAL_GIT_PATH}/${questionFilePath}`;

      cy.readFile(fullPath).then((str) => {
        const doc = yamljs.parse(str);

        //Assert that the name of the question is correct
        expect(doc.name).to.equal(REMOTE_QUESTION_NAME);

        //Next, Update the name and pull in the changes
        doc.name = UPDATED_REMOTE_QUESTION_NAME;

        cy.writeFile(fullPath, yamljs.stringify(doc));
        cy.exec("git -C " + LOCAL_GIT_PATH + " commit -am 'Local Update'");
      });
    });

    cy.findByTestId("main-navbar-root")
      .findByRole("button", { name: "Pull from Git" })
      .click();

    H.collectionTable()
      .findByText(UPDATED_REMOTE_QUESTION_NAME, { timeout: 10000 })
      .should("exist");
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
