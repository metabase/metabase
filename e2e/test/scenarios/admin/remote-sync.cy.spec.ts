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
      H.configureGitWithNewSyncedCollection("read-write").as(
        "syncedCollection",
      );
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
        .findByRole("link", { name: /Test Synced Collection/ })
        .click();

      H.collectionTable().findByText(REMOTE_QUESTION_NAME).should("exist");

      H.getPushOption().click();

      H.modal()
        .button(/Push changes/)
        .click();

      H.waitForTask({ taskName: "export" });
      H.expectUnstructuredSnowplowEvent({
        event: "remote_sync_push_changes",
        triggered_from: "app-bar",
      });

      H.navigationSidebar()
        .findByRole("link", { name: /Test Synced Collection/ })
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

      H.getPullOption().click();

      H.waitForTask({ taskName: "import" });
      H.expectUnstructuredSnowplowEvent({
        event: "remote_sync_pull_changes",
        triggered_from: "app-bar",
      });

      H.collectionTable()
        .findByText(UPDATED_REMOTE_QUESTION_NAME)
        .should("exist");
    });

    it("should not allow you to move content to the Synced Collection that references non Synced Collection items", () => {
      H.configureGitWithNewSyncedCollection("read-write").as(
        "syncedCollection",
      );
      cy.intercept("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`).as(
        "updateDashboard",
      );

      cy.visit("/collection/root");

      H.getSyncStatusIndicators().should("have.length", 0);

      const expectedError = "Uses content that is not remote synced.";

      cy.log("Test moving via 'Move' modal");
      H.openCollectionItemMenu("Orders in a dashboard");
      H.popover().findByText("Move").click();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Collections").click();
        H.entityPickerModalItem(1, "Test Synced Collection").click();
        cy.button("Move").click();
      });

      cy.wait("@updateDashboard").then((req) => {
        expect(req.response?.statusCode).to.eq(400);
        expect(req.response?.body.message).to.contain(expectedError);
        H.entityPickerModal().findByText(expectedError).should("exist");
        H.entityPickerModal().button("Cancel").click();
      });

      cy.log("Test moving via drag-and-drop");
      H.collectionTable().findByText("Orders in a dashboard").as("dragSubject");
      H.navigationSidebar()
        .findByText("Test Synced Collection")
        .as("dropTarget");
      H.dragAndDrop("dragSubject", "dropTarget");
      H.undoToast().should("contain.text", expectedError);

      cy.log("Test positive case");
      H.openCollectionItemMenu("Orders, Count");
      H.popover().findByText("Move").click();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Browse").click();
        H.entityPickerModalItem(1, "Test Synced Collection").click();
        cy.button("Move").click();
      });

      H.getSyncStatusIndicators().should("have.length", 1);
    });

    it("should show a warning modal when you try to push but are out of date", () => {
      const NEW_BRANCH = `new-branch-${Date.now()}`;
      H.copySyncedCollectionFixture();
      H.commitToRepo();
      H.configureGitAndPullChanges("read-write");
      H.wrapSyncedCollection();

      cy.visit("/collection/root");

      // Make a change in metabase
      H.moveCollectionItemToSyncedCollection("Orders");

      // Make a change outside metabase
      H.updateRemoteQuestion((doc) => {
        doc.name = "Sloan for Frontend Emperor";
        return doc;
      });

      H.getPushOption().click();

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
      H.getGitSyncControls().should("contain.text", NEW_BRANCH);
      H.goToSyncedCollection();

      H.collectionTable().within(() => {
        // Question we just moved
        cy.findByText("Orders");
        // Question we previously had in the Synced Collection
        cy.findByText("Remote Sync Test Question");
      });

      H.getSwitchBranchOption().click();
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
        H.getSwitchBranchOption().click();
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

        H.getGitSyncControls().should("contain.text", newBranchName);
      };

      const switchToExistingBranch = (branch: string) => {
        H.getSwitchBranchOption().click();
        H.popover()
          .findByPlaceholderText("Find or create a branch...")
          .type(branch);
        cy.findByRole("option", { name: branch }).click();
      };

      const pushUpdates = () => {
        H.getPushOption().click();

        H.modal()
          .button(/Push changes/)
          .click();

        H.waitForTask({ taskName: "export" });
        // Push button should be disabled when local changes are synced
        H.getPushOption().should("have.attr", "data-combobox-disabled", "true");
      };

      it("should allow you to create new branches and switch between them", () => {
        H.configureGitWithNewSyncedCollection("read-write").as(
          "syncedCollection",
        );

        const NEW_BRANCH_1 = `new-branch-${Date.now()}`;
        const NEW_BRANCH_2 = `new-branch-${Date.now() + 1}`;

        cy.visit("/collection/root");

        H.navigationSidebar()
          .findByRole("treeitem", { name: /Test Synced Collection/ })
          .click();

        // Test Synced Collection starts empty
        H.collectionTable().should("not.exist");
        cy.findByTestId("collection-empty-state").should("exist");

        createNewBranch(NEW_BRANCH_1);

        // Move something into synced collection for the new branch
        H.moveCollectionItemToSyncedCollection(
          "Orders, Count",
          "Test Synced Collection",
        );

        pushUpdates();

        // Go back to the main branch
        createNewBranch(NEW_BRANCH_2);

        H.moveCollectionItemToSyncedCollection(
          "Orders Model",
          "Test Synced Collection",
        );

        H.collectionTable().findByText("Orders, Count").should("exist");
        H.collectionTable().findByText("Orders Model").should("exist");
        pushUpdates();

        // Go back to the first branch
        switchToExistingBranch(NEW_BRANCH_1);

        H.expectUnstructuredSnowplowEvent({
          event: "remote_sync_branch_switched",
          triggered_from: "app-bar",
        });

        H.collectionTable().findByText("Orders, Count").should("exist");
        // The second item should not exist in the first branch
        H.collectionTable().findByText("Orders Model").should("not.exist");
      });

      it("should show a popup when trying to switch branches with unsynced changes", () => {
        H.configureGitWithNewSyncedCollection("read-write").as(
          "syncedCollection",
        );

        const NEW_BRANCH = `new-branch-${Date.now()}`;

        cy.visit("/collection/root");

        H.navigationSidebar()
          .findByRole("treeitem", { name: /Test Synced Collection/ })
          .click();

        // Test Synced Collection starts empty
        H.collectionTable().should("not.exist");
        cy.findByTestId("collection-empty-state").should("exist");

        createNewBranch(NEW_BRANCH);

        // Move something into synced collection for the new branch
        H.moveCollectionItemToSyncedCollection(
          "Orders, Count",
          "Test Synced Collection",
        );

        // Attempt to go back to main
        switchToExistingBranch("main");

        // Check that we haven't switched to main
        H.getGitSyncControls().should("not.contain.text", "main");

        H.modal().should("exist");
        H.modal().within(() => {
          cy.findByRole("heading", {
            name: "You have unsynced changes. What do you want to do?",
          });
          cy.findByLabelText(
            `Push changes to the current branch, ${NEW_BRANCH}`,
          );
          cy.findByLabelText("Create a new branch and push changes there");

          // Choose discard so that we can switch later
          cy.findByLabelText(
            /Delete unsynced changes \(can.t be undone\)/,
          ).click();
          cy.button(/Delete unsynced changes/).click();
        });

        // Now we switched to main
        H.getGitSyncControls().should("contain.text", "main");
      });
    });

    describe("unsynced changes", () => {
      beforeEach(() => {
        H.copySyncedCollectionFixture();
        H.commitToRepo();
        H.configureGitAndPullChanges("read-write");
        H.wrapSyncedCollection();

        cy.visit("/collection/root");

        // Ensure that remote is ahead of us so that the pull button is enabled
        H.updateRemoteQuestion((doc) => {
          doc.description = "Sloan for Frontend Emperor";
          return doc;
        });

        // Make a change in metabase
        H.moveCollectionItemToSyncedCollection("Orders");

        H.goToSyncedCollection();
        H.getPullOption().click();
      });

      it("can force push changes", () => {
        cy.findByRole("dialog", { name: /unsynced changes/ }).within(() => {
          cy.findByRole("radio", { name: /Force push to main/ }).click();
          cy.button(/Push changes/).click();
        });

        H.waitForTask({ taskName: "export" });

        H.getGitSyncControls().should("contain.text", "main");
        H.collectionTable().within(() => {
          cy.findByText("Orders").should("exist");
          cy.findByText(REMOTE_QUESTION_NAME).should("exist");
        });
      });

      it("can stash changes to a new branch", () => {
        const NEW_BRANCH = `new-branch-${Date.now()}`;
        cy.findByRole("dialog", { name: /unsynced changes/ }).within(() => {
          cy.findByRole("radio", { name: /new branch/ }).click();
          cy.findByPlaceholderText("your-branch-name").type(NEW_BRANCH);
          cy.button(/Push changes/).click();
        });

        H.waitForTask({ taskName: "export" }).then(() => {
          H.getGitSyncControls().should("contain.text", NEW_BRANCH);
          H.collectionTable().within(() => {
            cy.findByText("Orders").should("exist");
            cy.findByText(REMOTE_QUESTION_NAME).should("exist");
          });

          H.modal().findByText("Pushing to Git").should("not.exist");

          H.getSwitchBranchOption().click();
          H.popover().findByRole("option", { name: "main" }).click();

          H.waitForTask({ taskName: "import" }).then(() => {
            H.collectionTable().within(() => {
              cy.findByText("Orders").should("not.exist");
              cy.findByText(REMOTE_QUESTION_NAME).should("exist");
            });
          });
        });
      });

      it("can delete/discard changes", () => {
        cy.findByRole("dialog", { name: /unsynced changes/ }).within(() => {
          cy.findByRole("radio", { name: /Delete/ }).click();
          cy.button("Delete unsynced changes").click();
        });

        H.waitForTask({ taskName: "import" });

        H.getGitSyncControls().should("contain.text", "main");
        H.collectionTable().within(() => {
          cy.findByText("Orders").should("not.exist");
          cy.findByText(REMOTE_QUESTION_NAME).should("exist");
        });
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
        .should("be.visible")
        .click()
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

      H.modal().should("not.exist");
      H.goToMainApp();

      // Branch picker should appear in the app bar (doesn't require import)
      H.getGitSyncControls().should("contain.text", "main");
    });

    it("can set up read-only mode", () => {
      // Set up a Synced Collection to connect to, otherwise read-only mode will be empty
      // Copy some files
      H.copySyncedCollectionFixture();

      // Commit those files to the main branch
      H.commitToRepo();

      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .should("be.visible")
        .click()
        .clear()
        .type(LOCAL_GIT_URL);

      cy.findByTestId("admin-layout-content").findByText("Read-only").click();
      cy.button("Set up Remote Sync").click();
      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      H.modal().should("not.exist", { timeout: 10000 });
      H.goToMainApp();

      // In read-only mode, git sync controls should not be visible in app bar
      H.getGitSyncControls().should("not.exist");

      H.navigationSidebar().within(() => {
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
        .should("be.visible")
        .click()
        .clear()
        .type("SecretToken");
      // Still disabled - url is not set
      cy.button("Set up Remote Sync").should("be.disabled");

      cy.findByLabelText(/repository url/i)
        .scrollIntoView()
        .should("be.visible")
        .click()
        .clear()
        .type(LOCAL_GIT_URL);

      // Enabled now - url is set
      cy.button("Set up Remote Sync").should("be.enabled");
    });

    it("shows an error if git settings are invalid", () => {
      cy.intercept("PUT", "/api/ee/remote-sync/settings").as("saveSettings");
      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .should("be.visible")
        .click()
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
      H.configureGitAndPullChanges("read-write");

      cy.visit("/admin/settings/remote-sync");

      // The button may be scrolled off screen - scroll to bottom of the settings content first
      cy.button(/Disable remote sync/).click();

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

      H.goToMainApp();

      ensureSyncedCollectionIsVisible();
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
      cy.findByLabelText("Sync branch").scrollIntoView().clear().type("test");
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

  describe("shared tenant collections", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.setupGitSync();
      H.interceptTask();

      // Enable tenants feature
      H.enableTenants();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    describe("admin settings", () => {
      it("should show shared tenant collections section when tenants are enabled and remote sync is configured", () => {
        // First set up remote sync
        H.configureGitAndPullChanges("read-write");

        // Create some tenant collections
        H.createSharedTenantCollection("Tenant A Shared");
        H.createSharedTenantCollection("Tenant B Shared");

        cy.visit("/admin/settings/remote-sync");

        cy.findByTestId("admin-layout-content").within(() => {
          // Main section should be visible
          cy.findByText("Collections to sync").should("exist");

          // Shared collections sub-section should be visible
          cy.findByText("Shared collections").should("exist");

          // Should show the tenant collections
          cy.findByText("Tenant A Shared").should("exist");
          cy.findByText("Tenant B Shared").should("exist");

          // Each collection should have a sync toggle
          cy.findAllByRole("switch").should("have.length.at.least", 2);
        });
      });

      it("should not show shared tenant collections section when tenants are disabled", () => {
        // Disable tenants
        cy.request("PUT", "/api/setting/use-tenants", { value: false });

        H.configureGitAndPullChanges("read-write");
        cy.visit("/admin/settings/remote-sync");

        // Shared collections sub-section should NOT be visible
        cy.findByTestId("admin-layout-content")
          .findByText("Shared collections")
          .should("not.exist");
      });

      it("should not show shared tenant collections section when remote sync is not enabled", () => {
        cy.visit("/admin/settings/remote-sync");

        // Collections to sync section should NOT be visible (remote sync not yet configured)
        cy.findByTestId("admin-layout-content")
          .findByText("Collections to sync")
          .should("not.exist");
      });

      it("should show empty state when no shared tenant collections exist", () => {
        H.configureGitAndPullChanges("read-write");
        cy.visit("/admin/settings/remote-sync");

        cy.findByTestId("admin-layout-content").within(() => {
          cy.findByText("Shared collections").should("exist");
          cy.findByText("No shared tenant collections found").should("exist");
        });
      });

      it("can toggle sync for a shared tenant collection", () => {
        H.configureGitAndPullChanges("read-write");

        // Create a tenant collection
        H.createSharedTenantCollection("Tenant Collection To Sync");

        cy.visit("/admin/settings/remote-sync");

        cy.findByTestId("admin-layout-content").within(() => {
          // Find the collection row and toggle sync on
          cy.findByRole("switch", {
            name: "Sync Tenant Collection To Sync",
          }).click({ force: true });

          // Save changes
          cy.button("Save changes").click();

          // Verify the setting was saved
          cy.findByText(/success/i).should("exist");
        });
      });

      it("should disable sync toggles in read-only mode", () => {
        H.copySyncedCollectionFixture();
        H.commitToRepo();
        H.configureGit("read-only");

        // Create a tenant collection
        H.createSharedTenantCollection("Read Only Tenant Collection");

        cy.visit("/admin/settings/remote-sync");

        // The switch should be disabled in read-only mode
        cy.findByTestId("admin-layout-content")
          .findByRole("switch", { name: "Sync Read Only Tenant Collection" })
          .should("be.disabled");
      });

      it("should reset collection toggles when switching from read-write to read-nly", () => {
        H.copySyncedCollectionFixture();
        H.commitToRepo();
        H.configureGitAndPullChanges("read-write");

        // Create a tenant collection
        H.createSharedTenantCollection("Mode Switch Test Collection");

        cy.visit("/admin/settings/remote-sync");

        cy.findByTestId("admin-layout-content").within(() => {
          // Toggle sync on
          cy.findByRole("switch", {
            name: "Sync Mode Switch Test Collection",
          }).click({ force: true });

          // Verify it's checked
          cy.findByRole("switch", {
            name: "Sync Mode Switch Test Collection",
          }).should("be.checked");

          // Switch to read-only mode
          cy.findByText("Read-only").click();

          // The toggle should reset to unchecked (initial value)
          cy.findByRole("switch", {
            name: "Sync Mode Switch Test Collection",
          }).should("not.be.checked");
        });
      });
    });

    describe("syncing tenant collections", () => {
      it("can push changes from a synced tenant collection", () => {
        H.configureGitAndPullChanges("read-write");

        // Create a tenant collection
        H.createSharedTenantCollection("Syncable Tenant Collection").then(
          (response) => {
            const tenantCollectionId = response.body.id;

            // Enable sync for this collection via admin settings
            cy.visit("/admin/settings/remote-sync");
            // Mantine Switch has a hidden input (0x0 pixels), so we need force: true
            cy.findByTestId("admin-layout-content")
              .findByRole("switch", { name: "Sync Syncable Tenant Collection" })
              .click({ force: true });
            cy.findByTestId("admin-layout-content")
              .button("Save changes")
              .click();

            // Create a question in the tenant collection
            H.createQuestion({
              name: "Tenant Question",
              query: {
                "source-table": PRODUCTS_ID,
              },
              collection_id: tenantCollectionId,
            });

            cy.visit("/");

            // Verify sync status indicator appears
            H.getSyncStatusIndicators().should("have.length.greaterThan", 0);

            // Push changes
            H.getPushOption().click();
            H.modal()
              .button(/Push changes/)
              .click();
            H.waitForTask({ taskName: "export" });

            // Verify changes were pushed (status indicator should clear)
            H.navigationSidebar()
              .findByRole("link", { name: /Syncable Tenant Collection/ })
              .findByTestId("remote-sync-status")
              .should("not.exist");
          },
        );
      });

      it("shows sync status badge on synced tenant collections in sidebar", () => {
        H.configureGitAndPullChanges("read-write");

        // Create a tenant collection
        H.createSharedTenantCollection("Badge Test Collection").then(
          (response) => {
            const collectionId = response.body.id;

            // Enable sync
            cy.visit("/admin/settings/remote-sync");
            // Mantine Switch has a hidden input (0x0 pixels), so we need force: true
            cy.findByTestId("admin-layout-content")
              .findByRole("switch", { name: "Sync Badge Test Collection" })
              .click({ force: true });
            cy.findByTestId("admin-layout-content")
              .button("Save changes")
              .click();

            // Create content to trigger dirty state
            H.createQuestion({
              name: "Status Badge Test Question",
              query: { "source-table": PRODUCTS_ID },
              collection_id: collectionId,
            });

            cy.visit("/");

            // Verify the sync status badge appears on the tenant collection
            H.navigationSidebar()
              .findByRole("treeitem", { name: /Badge Test Collection/ })
              .findByTestId("remote-sync-status")
              .should("exist");
          },
        );
      });
    });
  });
});

const ensureSyncedCollectionIsVisible = () => {
  H.navigationSidebar().within(() => {
    cy.findByRole("treeitem", { name: /Synced Collection/ }).should("exist");
  });
};
