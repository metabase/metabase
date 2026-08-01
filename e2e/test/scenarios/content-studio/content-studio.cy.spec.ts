import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Collection } from "metabase-types/api";

const { H } = cy;

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const SYNCED_COLLECTION = "Synced Collection";
const REMOTE_QUESTION = "Remote Sync Test Question";
const IMPORTED_TRANSFORM = "Imported Simple SQL transform";
const BRANCH = "feature-branch";

describe("content studio", () => {
  describe("entry and gating", () => {
    beforeEach(() => {
      H.restore();
    });

    it("opens from the app switcher and upsells when the token feature is missing", () => {
      cy.signInAsAdmin();
      cy.visit("/");

      H.getProfileLink().click();
      H.popover().findByText("Content studio").click();

      cy.location("pathname").should("eq", "/content-studio");
      cy.findByTestId("content-studio-nav").should("be.visible");
      cy.findByRole("heading", {
        name: "Manage your Metabase content in Git",
      }).should("be.visible");
    });

    it("keeps non-admins out of the studio", () => {
      cy.signInAsNormalUser();
      cy.visit("/content-studio");

      cy.location("pathname").should("eq", "/unauthorized");
      cy.findByTestId("content-studio-nav").should("not.exist");
    });
  });

  describe("the main branch", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      H.setupGitSync();
      H.interceptTask();
      H.copySyncedCollectionFixture();
      H.commitToRepo();
      H.configureGitAndPullChanges("read-write");
    });

    it("browses the synced content, opens a hosted question, and pushes local changes", () => {
      H.wrapSyncedCollection();
      cy.get("@syncedCollection").then((syncedCollection) => {
        H.createQuestion({
          name: "Main Branch Question",
          query: { "source-table": PRODUCTS_ID },
          // Unjustified type cast. FIXME
          collection_id: (syncedCollection as unknown as Collection).id,
        });
      });

      H.visitContentStudio();
      cy.location("pathname").should("eq", "/content-studio/collections");
      H.getContentStudioBranchSelector().should("contain.text", "Main (main)");

      cy.log("the synced collection is in the sidebar and in the content pane");
      H.getContentStudioTree("Collections")
        .findByRole("link", { name: SYNCED_COLLECTION })
        .should("be.visible");
      H.getContentStudioFolderContents()
        .findByRole("link", { name: SYNCED_COLLECTION })
        .click();

      H.collectionTable()
        .should("contain", REMOTE_QUESTION)
        .and("contain", "Main Branch Question");

      cy.log("questions open on the studio's own page, not in the main app");
      H.collectionTable().findByText(REMOTE_QUESTION).click();
      cy.location("pathname").should("contain", "/content-studio/question/");
      cy.findByTestId("content-studio-question").should(
        "contain",
        REMOTE_QUESTION,
      );

      cy.log("the new question left the branch dirty; pushing clears it");
      H.getContentStudioSyncControls()
        .findByTestId("remote-sync-status")
        .should("be.visible");
      H.clickPushOption();
      H.modal()
        .button(/Push changes/)
        .click();
      H.waitForTask({ taskName: "export" });

      H.getContentStudioSyncControls().should("be.visible");
      H.getContentStudioSyncControls()
        .findByTestId("remote-sync-status")
        .should("not.exist");
    });
  });

  describe("a checked-out branch", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      H.setupGitSync();
      H.interceptTask();
      H.copySyncedCollectionFixture();
      H.commitToRepo();
      H.createRemoteBranch(BRANCH);
      H.configureGitAndPullChanges("read-write");
    });

    it("checks out a branch and browses the content it pulled in", () => {
      H.visitContentStudio();
      H.checkOutContentStudioBranch(BRANCH);
      H.waitForTask({ taskName: "import" });

      H.getContentStudioBranchSelector().should("contain.text", BRANCH);
      cy.location("search").should("contain", "worktree=");

      cy.log("the branch's own copy of the synced collection fills the trees");
      H.getContentStudioTree("Collections")
        .findByRole("link", { name: SYNCED_COLLECTION })
        .click();
      H.collectionTable().findByText(REMOTE_QUESTION).click();

      cy.findByTestId("content-studio-question").should(
        "contain",
        REMOTE_QUESTION,
      );
      cy.log("an open card keeps the studio on the branch it belongs to");
      H.getContentStudioBranchSelector().should("contain.text", BRANCH);
    });

    it("creates content on a branch and keeps it out of the main app", () => {
      const BRANCH_COLLECTION = "Branch Collection";
      const BRANCH_DASHBOARD = "Branch Dashboard";
      const BRANCH_SNIPPET = "Branch Snippet";

      H.visitContentStudio();
      H.checkOutContentStudioBranch(BRANCH);
      H.waitForTask({ taskName: "import" });

      cy.log("a collection created from the sidebar lands at the branch root");
      cy.findByRole("button", { name: "Create a new collection" }).click();
      cy.findByTestId("new-collection-modal").within(() => {
        cy.findByLabelText("Name").type(BRANCH_COLLECTION);
        cy.button("Create").click();
      });
      H.getContentStudioTree("Collections")
        .findByRole("link", { name: BRANCH_COLLECTION })
        .click();
      cy.location("pathname").should("contain", "/content-studio/collection/");

      cy.log("a dashboard created there opens in the main app with a banner");
      // The button's icon carries its own accessible label, so the name reads "add icon New".
      cy.findByRole("button", { name: /New$/ }).click();
      H.popover()
        .findByRole("menuitem", { name: /Dashboard/ })
        .click();
      cy.findByTestId("new-dashboard-modal").within(() => {
        cy.findByLabelText("Name").type(BRANCH_DASHBOARD);
        cy.button("Create").click();
      });

      cy.location("pathname").should("contain", "/dashboard/");
      cy.findByTestId("branch-entity-banner").should(
        "contain",
        `This dashboard is on the ${BRANCH} branch.`,
      );
      cy.findByTestId("branch-entity-banner")
        .findByText("Open in Content Studio")
        .click();
      cy.location("pathname").should("contain", "/content-studio/collection/");

      cy.log("a snippet created there belongs to the branch too");
      H.getContentStudioTree("SQL snippets")
        .findByRole("link", { name: "SQL snippets" })
        .click();
      cy.findByRole("link", { name: "New snippet" }).click();
      H.DataStudio.Snippets.editor.type("SELECT 1");
      H.DataStudio.Snippets.nameInput().clear().type(BRANCH_SNIPPET);
      H.DataStudio.Snippets.saveButton().click();
      H.DataStudio.Snippets.editPage().should("contain", BRANCH_SNIPPET);

      cy.log("the main app's own collection tree never shows branch content");
      H.goToMainApp();
      H.navigationSidebar()
        .should("contain", SYNCED_COLLECTION)
        .and("not.contain", BRANCH_COLLECTION);
    });

    it("pushes a dirty branch to its own branch", () => {
      H.visitContentStudio();
      H.checkOutContentStudioBranch(BRANCH);
      H.waitForTask({ taskName: "import" });

      cy.findByRole("button", { name: "Create a new collection" }).click();
      cy.findByTestId("new-collection-modal").within(() => {
        cy.findByLabelText("Name").type("Pushed Collection");
        cy.button("Create").click();
      });

      H.getContentStudioSyncControls()
        .findByTestId("remote-sync-status")
        .should("be.visible");
      H.clickPushOption();
      H.modal()
        .button(/Push changes/)
        .click();
      H.waitForTask({ taskName: "export" });

      H.getContentStudioSyncControls().should("be.visible");
      H.getContentStudioSyncControls()
        .findByTestId("remote-sync-status")
        .should("not.exist");
    });

    it("offers only branch-safe choices when pulling a branch that moved on", () => {
      H.visitContentStudio();
      H.checkOutContentStudioBranch(BRANCH);
      H.waitForTask({ taskName: "import" });

      cy.findByRole("button", { name: "Create a new collection" }).click();
      cy.findByTestId("new-collection-modal").within(() => {
        cy.findByLabelText("Name").type("Conflicting Collection");
        cy.button("Create").click();
      });
      H.advanceRemoteBranch(BRANCH);

      H.getContentStudioSyncControls()
        .findByTestId("remote-sync-status")
        .should("be.visible");
      H.clickPullOption();

      cy.log(
        "a checkout is pinned to its branch, so stashing away is not on offer",
      );
      cy.findByRole("dialog", { name: /unsynced changes/ })
        .should("contain", "Force push to")
        .and("contain", "Delete unsynced changes")
        .and("not.contain", "Create a new branch and push changes there");
    });

    it("deletes a checkout and falls back to the main branch", () => {
      H.visitContentStudio();
      H.checkOutContentStudioBranch(BRANCH);
      H.waitForTask({ taskName: "import" });

      H.getContentStudioTree("Collections")
        .findByRole("link", { name: SYNCED_COLLECTION })
        .should("be.visible");

      cy.findByRole("button", { name: "Branch options" }).click();
      H.popover()
        .findByRole("menuitem", { name: /Delete checkout/ })
        .click();
      H.modal()
        .button(/Delete checkout/)
        .click();

      H.getContentStudioBranchSelector().should("contain.text", "Main (main)");
      cy.location("search").should("not.contain", "worktree=");
      cy.findByRole("button", { name: "Branch options" }).should("not.exist");

      cy.log("the branch is gone from the picker");
      H.getContentStudioBranchSelector().findByRole("button").click();
      cy.findByRole("listbox", { name: "Branches" })
        .should("contain", "Main (main)")
        .and("not.contain", BRANCH);
    });
  });

  describe("transforms on a branch", () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      H.updateSetting("transforms-enabled", true);
      H.setupGitSync();
      H.interceptTask();
      cy.intercept("PUT", "/api/transform/*").as("updateTransform");

      H.queryWritableDB(
        "CREATE TABLE IF NOT EXISTS imported_transform (column1 INT);",
      );
      H.resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: "imported_transform",
      });

      H.copySyncedTransformsCollectionFixture();
      H.commitToRepo();
      H.createRemoteBranch(BRANCH);
      H.configureGit("read-write");
    });

    it("edits a branch transform and runs it as a query, but never as a transform", () => {
      H.visitContentStudio();
      H.checkOutContentStudioBranch(BRANCH);
      H.waitForTask({ taskName: "import" });

      H.getContentStudioTree("Transforms")
        .findByRole("link", { name: "Transforms" })
        .click();
      H.getContentStudioFolderContents()
        .findByRole("link", { name: IMPORTED_TRANSFORM })
        .click();
      cy.findByTestId("transforms-header").should(
        "contain",
        IMPORTED_TRANSFORM,
      );

      cy.log("edit the query and run it against the database");
      H.DataStudio.Transforms.clickEditDefinition();
      cy.location("pathname").should("contain", "/edit");
      H.NativeEditor.clear().type("SELECT 2 AS answer");
      H.DataStudio.Transforms.queryEditor().findByTestId("run-button").click();
      H.tableInteractiveBody().should("contain", "2");

      H.DataStudio.Transforms.queryEditor().button("Save").click();
      cy.wait("@updateTransform");
      cy.location("pathname").should("not.contain", "/edit");

      cy.log(
        "running it as a transform would write to its target, so it can't",
      );
      H.DataStudio.Transforms.runTab().click();
      cy.findAllByTestId("run-button")
        .should("have.length", 1)
        .eq(0)
        .should("be.disabled");
    });
  });
});
