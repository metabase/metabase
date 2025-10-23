import yamljs from "yamljs";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Collection } from "metabase-types/api";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

const LOCAL_GIT_URL = "file://" + H.LOCAL_GIT_PATH + "/.git";

const REMOTE_QUESTION_NAME = "Remote Sync Test Question";

describe("Remote Sync", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.setupGitSync();
  });

  describe("Development Mode", () => {
    beforeEach(() => {
      H.configureGit("development");
      H.wrapLibraryCollection();
    });

    it("can push and pull changes", () => {
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

      H.wrapLibraryFiles();

      cy.get("@libraryFiles").then((libraryFiles) => {
        const questionFilePath = (libraryFiles as unknown as string[]).find(
          (file) => file.includes("remote_sync_test_question.yaml"),
        );

        const fullPath = `${H.LOCAL_GIT_PATH}/${questionFilePath}`;

        cy.readFile(fullPath).then((str) => {
          const doc = yamljs.parse(str);

          //Assert that the name of the question is correct
          expect(doc.name).to.equal(REMOTE_QUESTION_NAME);

          //Next, Update the name and pull in the changes
          doc.name = UPDATED_REMOTE_QUESTION_NAME;

          cy.writeFile(fullPath, yamljs.stringify(doc));
          cy.exec("git -C " + H.LOCAL_GIT_PATH + " commit -am 'Local Update'");
        });
      });

      cy.findByTestId("main-navbar-root")
        .findByRole("button", { name: "Pull from Git" })
        .click();

      H.collectionTable()
        .findByText(UPDATED_REMOTE_QUESTION_NAME, { timeout: 10000 })
        .should("exist");
    });
  });

  describe("remote sync admin settings page", () => {
    it("can set up development mode", () => {
      cy.signInAsAdmin();
      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type(LOCAL_GIT_URL);
      cy.findByTestId("admin-layout-content").findByText("Development").click();
      cy.button("Set up Git Sync").click();
      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      //TODO: We should be able to remove this, but for now we need to do a page refresh to see changes
      cy.visit("/");

      H.navigationSidebar().within(() => {
        cy.findByRole("heading", { name: /synced collections/i }).should(
          "exist",
        );
        cy.findByTestId("branch-picker-button").should("contain.text", "main");
        cy.findByRole("treeitem", { name: /library/i }).should("exist");
      });
    });

    it("can set up production mode", () => {
      // Set up a library to connect to, otherwise production mode will be empty
      // Copy some files
      H.copyLibraryFixture();

      // Commit those files to the main branch
      H.commitToLibrary();

      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type(LOCAL_GIT_URL);

      cy.findByTestId("admin-layout-content").findByText("Production").click();
      cy.button("Set up Git Sync").click();
      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      //TODO: We should be able to remove this, but for now we need to do a page refresh to see changes
      cy.visit("/");

      H.navigationSidebar().within(() => {
        cy.findByRole("heading", { name: /synced collections/i }).should(
          "not.exist",
        );
        cy.findByTestId("branch-picker-button").should("not.exist");
        cy.findByRole("treeitem", { name: /Library/ }).click();
      });
      H.collectionTable().findByText(REMOTE_QUESTION_NAME);
    });

    it("shows an error if git settings are invalid", () => {
      cy.intercept("PUT", "/api/ee/remote-sync/settings").as("saveSettings");
      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type("file://invalid-path");
      cy.button("Set up Git Sync").click();

      cy.wait("@saveSettings").its("response.statusCode").should("eq", 400);
      cy.findByTestId("admin-layout-content")
        .findByText("Failed")
        .should("exist");
      cy.findByTestId("admin-layout-content")
        .findByText("Invalid git settings")
        .should("exist");
    });
  });

  describe("production mode", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.setupGitSync();
    });

    it("can change branches", () => {
      const UPDATED_REMOTE_QUESTION_NAME = "New Name";

      H.copyLibraryFixture();
      H.commitToLibrary();
      H.configureGit("production");

      cy.visit("/");

      H.navigationSidebar()
        .findByRole("treeitem", { name: /Library/ })
        .click();
      H.collectionTable().findByText(REMOTE_QUESTION_NAME);

      // Make a change, and commit it to the branch
      H.checkoutLibraryBranch("test");
      H.updateRemoteQuestion((doc) => {
        doc.name = UPDATED_REMOTE_QUESTION_NAME;
        return doc;
      });

      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText("Sync branch").clear().type("test");
      cy.button("Save changes").click();

      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      cy.findByRole("dialog", { name: "Switch branches?" })
        .button("Continue")
        .click();

      cy.findByRole("button", { name: "Save changes", timeout: 10000 }).should(
        "be.disabled",
      );

      cy.visit("/");

      H.navigationSidebar()
        .findByRole("treeitem", { name: /Library/ })
        .click();
      H.collectionTable().findByText(UPDATED_REMOTE_QUESTION_NAME);
    });
  });
});
