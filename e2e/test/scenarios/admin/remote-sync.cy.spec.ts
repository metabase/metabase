import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type { Collection } from "metabase-types/api";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

const LOCAL_GIT_URL = "file://" + H.LOCAL_GIT_PATH + "/.git";

const REMOTE_QUESTION_NAME = "Remote Sync Test Question";

describe("Remote Sync", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.setupGitSync();
    H.interceptTask();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("read-write Mode", () => {
    it("can push and pull changes", () => {
      H.configureGit("read-write");
      H.wrapSyncedCollection();
      const UPDATED_REMOTE_QUESTION_NAME = "Updated Question Name";

      cy.get("@syncedCollection").then((syncedCollection) => {
        H.createQuestion({
          name: REMOTE_QUESTION_NAME,
          query: {
            "source-table": PRODUCTS_ID,
          },
          collection_id: (syncedCollection as unknown as Collection)
            .id as number,
        });
      });

      cy.visit("/");

      // Ensure that status icon is present
      H.getSyncStatusIndicators().should("have.length.greaterThan", 0);
      H.navigationSidebar()
        .findByRole("link", { name: /Synced Collection/ })
        .click();

      H.collectionTable().findByText(REMOTE_QUESTION_NAME).should("exist");

      H.navigationSidebar()
        .findByRole("button", { name: "Push to Git" })
        .click();

      H.modal()
        .button(/Push changes/)
        .click();

      H.waitForTask({ taskName: "export" });
      H.expectUnstructuredSnowplowEvent({
        event: "remote_sync_push_changes",
        triggered_from: "sidebar",
      });

      H.navigationSidebar()
        .findByRole("link", { name: /Synced Collection/ })
        .findByTestId("remote-sync-status")
        .should("not.exist");

      H.updateRemoteQuestion(
        (doc) => {
          doc.name = UPDATED_REMOTE_QUESTION_NAME;
          return doc;
        },
        (doc) => {
          expect(doc.name).to.equal(REMOTE_QUESTION_NAME);
        },
      );

      cy.findByTestId("main-navbar-root")
        .findByRole("button", { name: "Pull from Git" })
        .click();

      H.waitForTask({ taskName: "import" });
      H.expectUnstructuredSnowplowEvent({
        event: "remote_sync_pull_changes",
        triggered_from: "sidebar",
      });

      H.collectionTable()
        .findByText(UPDATED_REMOTE_QUESTION_NAME)
        .should("exist");
    });

    it("should not allow you to move content to the Synced Collection that references non Synced Collection items", () => {
      H.configureGit("read-write");
      H.wrapSyncedCollection();
      cy.intercept("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`).as(
        "updateDashboard",
      );

      cy.visit("/collection/root");

      H.getSyncStatusIndicators().should("have.length", 0);

      H.openCollectionItemMenu("Orders in a dashboard");
      H.popover().findByText("Move").click();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Collections").click();
        H.entityPickerModalItem(1, "Synced Collection").click();
        cy.button("Move").click();
      });

      cy.wait("@updateDashboard").then((req) => {
        expect(req.response?.statusCode).to.eq(400);
        expect(req.response?.body.message).to.contain(
          "content that is not remote synced",
        );
      });

      H.entityPickerModal().button("Cancel").click();
      H.openCollectionItemMenu("Orders, Count");
      H.popover().findByText("Move").click();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Browse").click();
        H.entityPickerModalItem(1, "Synced Collection").click();
        cy.button("Move").click();
      });

      H.getSyncStatusIndicators().should("have.length", 1);
    });

    it("should show a warning modal when you try to push but are out of date", () => {
      const NEW_BRANCH = `new-branch-${Date.now()}`;
      H.copySyncedCollectionFixture();
      H.commitToRepo();
      H.configureGit("read-write");
      H.wrapSyncedCollection();

      cy.visit("/collection/root");

      // Make a change in metabase
      H.moveCollectionItemToSyncedCollection("Orders");

      // Make a change outside metabase
      H.updateRemoteQuestion((doc) => {
        doc.name = "Sloan for Frontend Emperor";
        return doc;
      });

      H.navigationSidebar()
        .findByRole("button", { name: "Push to Git" })
        .click();

      // Attempt to push changes
      cy.findByRole("dialog", { name: "Push to Git" })
        .button(/Push changes/)
        .click();

      // push local changes to a different branch, because the remote is ahead of us
      cy.findByRole("dialog", { name: /branch is behind/ }).within(() => {
        cy.findByRole("radio", { name: /Create a new branch/ }).click();
        cy.findByPlaceholderText("your-branch-name").type(NEW_BRANCH);
        cy.button("Push changes").click();
      });

      H.waitForTask({ taskName: "export" });

      // Ensure that we are on the newly created branch
      H.navigationSidebar()
        .findByTestId("branch-picker-button")
        .should("contain.text", NEW_BRANCH);
      H.goToSyncedCollection();

      H.collectionTable().within(() => {
        // Question we just moved
        cy.findByText("Orders");
        // Question we previously had in the Synced Collection
        cy.findByText("Remote Sync Test Question");
      });

      H.navigationSidebar().findByTestId("branch-picker-button").click();
      H.popover().findByRole("option", { name: "main" }).click();

      H.waitForTask({ taskName: "import" });

      // Upstream change will get pulled when switching branches
      H.collectionTable()
        .findByText("Sloan for Frontend Emperor")
        .should("exist");
    });

    describe("Branching", () => {
      let branchCount = 0;

      beforeEach(() => {
        branchCount = 0;
      });

      const createNewBranch = (newBranchName: string) => {
        branchCount++;
        H.navigationSidebar().findByTestId("branch-picker-button").click();
        H.popover()
          .findByPlaceholderText("Find or create a branch...")
          .type(newBranchName);
        H.popover()
          .findByRole("option", { name: /Create branch/ })
          .click();

        H.expectUnstructuredSnowplowEvent(
          {
            event: "remote_sync_branch_created",
            triggered_from: "branch-picker",
          },
          branchCount,
        );

        H.navigationSidebar()
          .findByTestId("branch-picker-button")
          .should("contain.text", newBranchName);
      };

      const switchToExistingBranch = (branch: string) => {
        H.navigationSidebar().findByTestId("branch-picker-button").click();
        H.popover()
          .findByPlaceholderText("Find or create a branch...")
          .type(branch);
        cy.findByRole("option", { name: branch }).click();
      };

      const pushUpdates = () => {
        H.navigationSidebar()
          .findByRole("button", { name: "Push to Git" })
          .click();

        H.modal()
          .button(/Push changes/)
          .click();

        H.waitForTask({ taskName: "export" });
        // Push button should be hidden when local changes are synced
        H.navigationSidebar()
          .findByRole("button", { name: "Push to Git" })
          .should("not.exist");
      };

      it("should allow you to create new branches and switch between them", () => {
        H.configureGit("read-write");
        H.wrapSyncedCollection();

        const NEW_BRANCH_1 = `new-branch-${Date.now()}`;
        const NEW_BRANCH_2 = `new-branch-${Date.now() + 1}`;

        cy.visit("/collection/root");

        H.navigationSidebar()
          .findByRole("treeitem", { name: /Synced Collection/ })
          .click();

        // Synced Synced Collection starts empty
        H.collectionTable().should("not.exist");
        cy.findByTestId("collection-empty-state").should("exist");

        createNewBranch(NEW_BRANCH_1);

        // Move something into Synced Collection for the new branch
        H.moveCollectionItemToSyncedCollection("Orders, Count");

        pushUpdates();

        // Go back to the main branch
        createNewBranch(NEW_BRANCH_2);

        H.moveCollectionItemToSyncedCollection("Orders Model");

        H.collectionTable().findByText("Orders, Count").should("exist");
        H.collectionTable().findByText("Orders Model").should("exist");
        pushUpdates();

        // Go back to the first branch
        switchToExistingBranch(NEW_BRANCH_1);

        H.expectUnstructuredSnowplowEvent({
          event: "remote_sync_branch_switched",
          triggered_from: "sidebar",
        });

        H.collectionTable().findByText("Orders, Count").should("exist");
        // The second item should not exist in the first branch
        H.collectionTable().findByText("Orders Model").should("not.exist");
      });

      it("should show a popup when trying to switch branches with unsynced changes", () => {
        H.configureGit("read-write");

        const NEW_BRANCH = `new-branch-${Date.now()}`;

        cy.visit("/collection/root");

        H.navigationSidebar()
          .findByRole("treeitem", { name: /Synced Collection/ })
          .click();

        // Synced Synced Collection starts empty
        H.collectionTable().should("not.exist");
        cy.findByTestId("collection-empty-state").should("exist");

        createNewBranch(NEW_BRANCH);

        // Move something into Synced Collection for the new branch
        H.moveCollectionItemToSyncedCollection("Orders, Count");

        // Attempt to go back to main
        switchToExistingBranch("main");

        // Check that we haven't switched to main
        H.navigationSidebar()
          .findByTestId("branch-picker-button")
          .should("not.contain.text", "main");

        H.modal().should("exist");
        H.modal().within(() => {
          cy.findByRole("heading", {
            name: "You have unsynced changes. What do you want to do?",
          });
          cy.findByLabelText(
            "Push changes to the current branch, " + NEW_BRANCH,
          );
          cy.findByLabelText("Create a new branch and push changes there");

          // Choose discard so that we can switch later
          cy.findByLabelText(
            "Delete unsynced changes (can’t be undone)",
          ).click();
          cy.button(/Delete unsynced changes/).click();
        });

        // Now we switched to main
        H.navigationSidebar()
          .findByTestId("branch-picker-button")
          .should("contain.text", "main");
      });
    });

    describe("unsynced changes", () => {
      beforeEach(() => {
        H.copySyncedCollectionFixture();
        H.commitToRepo();
        H.configureGit("read-write");
        H.wrapSyncedCollection();

        cy.visit("/collection/root");

        // Make a change in metabase
        H.moveCollectionItemToSyncedCollection("Orders");

        H.goToSyncedCollection();
        H.navigationSidebar()
          .findByRole("button", { name: "Pull from Git" })
          .click();
      });

      it("push changes", () => {
        cy.findByRole("dialog", { name: /unsynced changes/ }).within(() => {
          cy.findByRole("radio", { name: /Push changes/ }).click();
          cy.button("Push changes").click();
        });

        H.waitForTask({ taskName: "export" });

        H.branchPicker().should("contain.text", "main");
        H.collectionTable().within(() => {
          cy.findByText("Orders").should("exist");
          cy.findByText(REMOTE_QUESTION_NAME).should("exist");
        });
      });

      it("new branch", () => {
        const NEW_BRANCH = `new-branch-${Date.now()}`;
        cy.findByRole("dialog", { name: /unsynced changes/ }).within(() => {
          cy.findByRole("radio", { name: /new branch/ }).click();
          cy.findByPlaceholderText("your-branch-name").type(NEW_BRANCH);
          cy.button("Push changes").click();
        });

        H.waitForTask({ taskName: "export" });

        H.branchPicker().should("contain.text", NEW_BRANCH);
        H.collectionTable().within(() => {
          cy.findByText("Orders").should("exist");
          cy.findByText(REMOTE_QUESTION_NAME).should("exist");
        });

        H.branchPicker().click();
        H.popover().findByRole("option", { name: "main" }).click();

        H.waitForTask({ taskName: "import" });
        H.collectionTable().within(() => {
          cy.findByText("Orders").should("not.exist");
          cy.findByText(REMOTE_QUESTION_NAME).should("exist");
        });
      });

      it("delete changes", () => {
        cy.findByRole("dialog", { name: /unsynced changes/ }).within(() => {
          cy.findByRole("radio", { name: /Delete/ }).click();
          cy.button("Delete unsynced changes").click();
        });

        H.waitForTask({ taskName: "import" });

        H.branchPicker().should("contain.text", "main");
        H.collectionTable().within(() => {
          cy.findByText("Orders").should("not.exist");
          cy.findByText(REMOTE_QUESTION_NAME).should("exist");
        });
      });

      it("upstream changes", () => {
        // Make a change outside metabase
        H.updateRemoteQuestion((doc) => {
          doc.name = "Sloan for Frontend Emperor";
          return doc;
        });

        cy.findByRole("dialog", { name: /unsynced changes/ }).within(() => {
          cy.findByRole("radio", { name: /Push/ }).click();
          cy.button("Push changes").click();
        });

        cy.findByRole("list", { name: /undo-list/i }).findByText(
          /Cannot export changes/,
        );
      });
    });
  });

  describe("remote sync admin settings page", () => {
    beforeEach(() => {
      H.restore();
      H.activateToken("bleeding-edge");
      H.setupGitSync();
      cy.signInAsAdmin();
    });

    it("can set up read-write mode", () => {
      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type(LOCAL_GIT_URL);
      cy.findByTestId("admin-layout-content").findByText("Read-write").click();
      cy.button("Set up Remote Sync").click();

      H.expectUnstructuredSnowplowEvent({
        event: "remote_sync_settings_changed",
        triggered_from: "admin-settings",
      });

      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      H.waitForTask({ taskName: "import" });
      H.modal().should("not.exist");
      cy.findByTestId("exit-admin").click();

      H.navigationSidebar().within(() => {
        cy.findByRole("heading", { name: /synced collections/i }).should(
          "exist",
        );
        cy.findByTestId("branch-picker-button").should("contain.text", "main");
        cy.findByRole("treeitem", { name: /Synced Collection/i }).should(
          "exist",
        );
      });
    });

    it("can set up read-only mode", () => {
      // Set up a Synced Collection to connect to, otherwise read-only mode will be empty
      // Copy some files
      H.copySyncedCollectionFixture();

      // Commit those files to the main branch
      H.commitToRepo();

      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type(LOCAL_GIT_URL);

      cy.findByTestId("admin-layout-content").findByText("Read-only").click();
      cy.button("Set up Remote Sync").click();
      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      H.modal().should("not.exist", { timeout: 10000 });
      cy.findByTestId("exit-admin").click();

      H.navigationSidebar().within(() => {
        cy.findByRole("heading", { name: /synced collections/i }).should(
          "not.exist",
        );
        cy.findByTestId("branch-picker-button").should("not.exist");

        cy.findByRole("treeitem", { name: /Synced Collection/ }).click();
      });
    });

    it("should disable 'Set up Remote Sync' button if git url is not set (#65653)", () => {
      cy.visit("/admin/settings/remote-sync");
      cy.button("Set up Remote Sync").should("be.disabled");

      cy.findByRole("switch", { name: "Auto-sync with git" }).click({
        force: true,
      });

      // Trivial dirty state should not be enough to enable the button
      cy.button("Set up Remote Sync").should("be.disabled");

      cy.findByLabelText(/Access Token/i)
        .clear()
        .type("SecretToken");
      // Still disabled - url is not set
      cy.button("Set up Remote Sync").should("be.disabled");

      cy.findByLabelText(/repository url/i)
        .clear()
        .type(LOCAL_GIT_URL);

      // Enabled now - url is set
      cy.button("Set up Remote Sync").should("be.enabled");
    });

    it("shows an error if git settings are invalid", () => {
      cy.intercept("PUT", "/api/ee/remote-sync/settings").as("saveSettings");
      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type("file://invalid-path");
      cy.button("Set up Remote Sync").click();

      cy.wait("@saveSettings").its("response.statusCode").should("eq", 400);
      cy.findByTestId("admin-layout-content")
        .findByText("Failed")
        .should("exist");
      cy.findByTestId("admin-layout-content")
        .findByText(
          "Failed to clone git repository: Git CloneCommand failed: URI not supported: file://invalid-path",
        )
        .should("exist");
    });

    it("can deactivate remote sync", () => {
      H.copySyncedCollectionFixture();
      H.commitToRepo();
      H.configureGit("read-write");

      cy.visit("/admin/settings/remote-sync");

      cy.findByTestId("admin-layout-content")
        .findByText("Enabled")
        .should("exist");

      cy.button("Disable Remote Sync").click();

      H.modal().within(() => {
        cy.findByRole("heading", { name: "Disable Remote Sync?" }).should(
          "exist",
        );
        cy.button("Disable").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "remote_sync_deactivated",
        triggered_from: "admin-settings",
      });

      cy.findByTestId("admin-layout-content")
        .findByText("Enabled")
        .should("not.exist");

      cy.findByTestId("exit-admin").click();

      ensureSyncedCollectionIsVisible();
    });

    it("can enable tenant collections remote sync in read-only mode when tenants feature is enabled", () => {
      // Enable tenants feature
      cy.request("PUT", "/api/setting/use-tenants", { value: true });

      H.copySyncedCollectionFixture();
      H.commitToRepo();

      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type(LOCAL_GIT_URL);

      cy.findByTestId("admin-layout-content").findByText("Read-only").click();

      // Tenant collections toggle should be visible when tenants is enabled
      cy.findByLabelText("Sync tenant collections").should("exist");
      cy.findByLabelText("Sync tenant collections").should("not.be.checked");

      // Enable tenant collections remote sync
      cy.findByLabelText("Sync tenant collections").click();
      cy.findByLabelText("Sync tenant collections").should("be.checked");

      cy.button("Set up Remote Sync").click();
      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      // Verify the setting persists
      cy.reload();
      cy.findByLabelText("Sync tenant collections").should("be.checked");
    });

    it("can enable tenant collections remote sync in read-write mode when tenants feature is enabled", () => {
      // Enable tenants feature
      cy.request("PUT", "/api/setting/use-tenants", { value: true });

      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type(LOCAL_GIT_URL);

      cy.findByTestId("admin-layout-content").findByText("Read-write").click();

      // Tenant collections toggle should be visible in read-write mode too
      cy.findByLabelText("Sync tenant collections").should("exist");
      cy.findByLabelText("Sync tenant collections").should("not.be.checked");

      // Enable tenant collections remote sync
      cy.findByLabelText("Sync tenant collections").click();
      cy.findByLabelText("Sync tenant collections").should("be.checked");

      cy.button("Set up Remote Sync").click();
      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      // Verify the setting persists
      cy.reload();
      cy.findByLabelText("Sync tenant collections").should("be.checked");
    });

    it("does not show tenant collections toggle when tenants feature is disabled", () => {
      // Ensure tenants feature is disabled
      cy.request("PUT", "/api/setting/use-tenants", { value: false });

      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type(LOCAL_GIT_URL);

      cy.findByTestId("admin-layout-content").findByText("Read-only").click();

      // Tenant collections toggle should not be visible
      cy.findByLabelText("Sync tenant collections").should("not.exist");
    });
  });

  describe("read-only mode", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.setupGitSync();
    });

    it("can change branches", () => {
      const UPDATED_REMOTE_QUESTION_NAME = "New Name";

      H.copySyncedCollectionFixture();
      H.commitToRepo();
      H.configureGit("read-only");

      cy.visit("/");

      H.navigationSidebar()
        .findByRole("treeitem", { name: /Synced Collection/ })
        .click();
      H.collectionTable().findByText(REMOTE_QUESTION_NAME);

      // Make a change, and commit it to the branch
      H.checkoutSyncedCollectionBranch("test");
      H.updateRemoteQuestion((doc) => {
        doc.name = UPDATED_REMOTE_QUESTION_NAME;
        return doc;
      });

      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText("Sync branch").clear().type("test");
      cy.findByTestId("remote-sync-submit-button").click();

      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      cy.findByRole("dialog", { name: "Switch branches?" })
        .button("Continue")
        .click();

      H.waitForTask({ taskName: "import" });

      cy.findByTestId("remote-sync-submit-button").should("be.disabled");

      cy.visit("/");

      H.navigationSidebar()
        .findByRole("treeitem", { name: /Synced Collection/ })
        .click();
      H.collectionTable().findByText(UPDATED_REMOTE_QUESTION_NAME);
    });
  });
});

const ensureSyncedCollectionIsVisible = () => {
  H.navigationSidebar().within(() => {
    cy.findByRole("treeitem", { name: /Synced Collection/ }).should("exist");
  });
};
