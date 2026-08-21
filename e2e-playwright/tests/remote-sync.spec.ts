/**
 * Playwright port of e2e/test/scenarios/admin/remote-sync.cy.spec.ts
 *
 * Admin remote-sync (git-sync): configure a git remote, push/pull content,
 * read-only vs read-write, branch switching, sync status, shared-tenant
 * collections, and initial-pull conflict handling.
 *
 * The git remote is a LOCAL file:// repo created in-process (support/
 * remote-sync.ts, mirroring support/snippets.ts) — no external git server. The
 * remote-sync REST endpoints are `:feature :none`, so they run on the EE jar
 * with the pro-self-hosted token.
 *
 * Gating (PORTING infra-gate rule):
 * - "read-write Mode" and "initial pull conflict handling" restore the
 *   `postgres-writable` snapshot (and the conflict describe drives the writable
 *   QA postgres). That snapshot is not generated in CI (-@external) and the QA
 *   postgres is not provisioned in the spike, so both are gated on
 *   PW_QA_DB_ENABLED and SKIP on the jar. Faithful-by-construction; a green run
 *   there means "correctly skipped".
 * - The admin-settings, read-only, and shared-tenant describes need only the
 *   local git repo + EE token (default snapshot) and RUN on the jar.
 *
 * Port notes:
 * - Snowplow helpers run real assertions, backed by the per-slot collector via
 *   ../support/snowplow.
 * - `H.interceptTask()` (a cy.intercept alias) is DROPPED — waitForTask polls
 *   the current-task endpoint directly.
 * - cy.wait("@updateDashboard"/"@saveSettings"/"@exportChanges") →
 *   page.waitForResponse registered before the triggering action (PORTING
 *   rule 2).
 * - `have.attr` on the boolean-ish data-combobox-disabled reads the real value
 *   ("true"), so the two-arg toHaveAttribute is correct here (not the
 *   boolean-presence gotcha).
 */
import { test, expect } from "../support/fixtures";
import { resolveToken } from "../support/api";
import { createQuestion } from "../support/factories";
import { dragAndDrop } from "../support/collections";
import { openCollectionItemMenu } from "../support/bookmarks-extras";
import { entityPickerModal } from "../support/notebook";
import { entityPickerModalItem } from "../support/question-new";
import { openSharingMenu, sharingMenu } from "../support/sharing";
import { undoToast } from "../support/metrics";
import {
  ORDERS_DASHBOARD_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import {
  WRITABLE_DB_ID,
  queryWritableDB,
  resyncDatabase,
} from "../support/schema-viewer";
import { createSqlTransform } from "../support/transforms-codegen";
import {
  collectionTable,
  modal,
  navigationSidebar,
  popover,
} from "../support/ui";
import {
  REMOTE_QUESTION_NAME,
  type RemoteSyncRepo,
  checkoutSyncedCollectionBranch,
  clickPullOption,
  clickPushOption,
  closeSyncResultModal,
  commitToRepo,
  configureGit,
  configureGitAndPullChanges,
  configureGitWithNewSyncedCollection,
  copySyncedCollectionFixture,
  copySyncedTransformsCollectionFixture,
  createBranchViaSettings,
  createSharedTenantCollection,
  enableTenants,
  getGitSyncControls,
  getPushOption,
  getSettingsBranchSwitcher,
  getSyncStatusIndicators,
  goToSyncedCollection,
  moveCollectionItemToSyncedCollection,
  setupGitSync,
  switchBranchViaSettings,
  teardownGitSync,
  updateRemoteQuestion,
  visitRemoteSyncSettings,
  waitForTask,
  wrapSyncedCollection,
} from "../support/remote-sync";
import {
  type SnowplowCapable,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const hasToken = Boolean(resolveToken("pro-self-hosted"));
const hasQaDb = Boolean(process.env.PW_QA_DB_ENABLED);

test.describe("Remote Sync", () => {
  test.skip(
    !hasToken,
    "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
  );

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  // -------------------------------------------------------------------------
  // read-write Mode — restores postgres-writable, so gated on PW_QA_DB_ENABLED.
  // -------------------------------------------------------------------------
  test.describe("read-write Mode", () => {
    test.skip(
      !hasQaDb,
      "restores the postgres-writable snapshot (not generated in CI); set PW_QA_DB_ENABLED",
    );

    let repo: RemoteSyncRepo;

    test.beforeEach(async ({ mb }) => {
      await mb.restore("postgres-writable");
      await resetSnowplow(mb);
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await mb.api.updateSetting("transforms-enabled", true);
      repo = setupGitSync();
    });

    test.afterEach(() => {
      teardownGitSync(repo);
    });

    test("can push and pull changes", async ({ page, mb }) => {
      const syncedCollection = await configureGitWithNewSyncedCollection(
        mb.api,
        repo,
        "read-write",
      );
      const UPDATED_REMOTE_QUESTION_NAME = "Updated Question Name";

      await createQuestion(mb.api, {
        name: REMOTE_QUESTION_NAME,
        query: { "source-table": PRODUCTS_ID },
        collection_id: syncedCollection.id,
      });

      await page.goto("/");

      // Ensure that status icon is present
      await expect(getSyncStatusIndicators(page).first()).toBeVisible();
      await navigationSidebar(page)
        .getByRole("link", { name: /Test Synced Collection/ })
        .click();

      await expect(
        collectionTable(page).getByText(REMOTE_QUESTION_NAME, { exact: true }),
      ).toBeVisible();

      await clickPushOption(page);

      await modal(page).getByRole("button", { name: /Push changes/ }).click();

      await waitForTask(page, { taskName: "export" });
      await expectUnstructuredSnowplowEvent(mb, {
        event: "remote_sync_push_changes",
        triggered_from: "app-bar",
      });

      await expect(
        navigationSidebar(page)
          .getByRole("link", { name: /Test Synced Collection/ })
          .getByTestId("remote-sync-status"),
      ).toHaveCount(0);

      updateRemoteQuestion(
        repo,
        (doc) => {
          doc.name = UPDATED_REMOTE_QUESTION_NAME;
          return doc;
        },
        (doc) => {
          expect(doc.name).toBe(REMOTE_QUESTION_NAME);
        },
      );

      await clickPullOption(page);

      await waitForTask(page, { taskName: "import" });
      await expectUnstructuredSnowplowEvent(mb, {
        event: "remote_sync_pull_changes",
        triggered_from: "app-bar",
      });

      await expect(
        collectionTable(page).getByText(UPDATED_REMOTE_QUESTION_NAME, {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should not allow you to move content to the Synced Collection that references non Synced Collection items", async ({
      page,
      mb,
    }) => {
      await configureGitWithNewSyncedCollection(mb.api, repo, "read-write");

      await page.goto("/collection/root");

      await expect(getSyncStatusIndicators(page)).toHaveCount(0);

      const expectedError = "Uses content that is not remote synced.";

      // Test moving via 'Move' modal
      await openCollectionItemMenu(page, "Orders in a dashboard");
      await popover(page).getByText("Move", { exact: true }).click();

      const updateDashboard = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === `/api/dashboard/${ORDERS_DASHBOARD_ID}` &&
          r.request().method() === "PUT",
      );

      await entityPickerModalItem(page, 0, "Our analytics").click();
      await entityPickerModalItem(page, 1, "Test Synced Collection").click();
      await entityPickerModal(page)
        .getByRole("button", { name: "Move", exact: true })
        .click();

      const response = await updateDashboard;
      expect(response.status()).toBe(400);
      const body = (await response.json()) as { message?: string };
      expect(body.message).toContain(expectedError);
      await expect(
        entityPickerModal(page).getByText(expectedError, { exact: true }),
      ).toBeVisible();
      await entityPickerModal(page)
        .getByRole("button", { name: "Cancel", exact: true })
        .click();

      // Test moving via drag-and-drop
      const dragSubject = collectionTable(page).getByText(
        "Orders in a dashboard",
        { exact: true },
      );
      const dropTarget = navigationSidebar(page).getByText(
        "Test Synced Collection",
        { exact: true },
      );
      await dragAndDrop(page, dragSubject, dropTarget);
      await expect(undoToast(page)).toContainText(expectedError);

      // Test positive case
      await openCollectionItemMenu(page, "Orders, Count");
      await popover(page).getByText("Move", { exact: true }).click();

      await entityPickerModalItem(page, 0, "Our analytics").click();
      await entityPickerModalItem(page, 1, "Test Synced Collection").click();
      await entityPickerModal(page)
        .getByRole("button", { name: "Move", exact: true })
        .click();

      await expect(getSyncStatusIndicators(page)).toHaveCount(1);
    });

    test("should show a warning modal when you try to push but are out of date", async ({
      page,
      mb,
    }) => {
      const NEW_BRANCH = `new-branch-${Date.now()}`;
      copySyncedCollectionFixture(repo);
      commitToRepo(repo);
      await configureGitAndPullChanges(mb.api, repo, "read-write");
      await wrapSyncedCollection(mb.api);

      await page.goto("/collection/root");

      // Make a change in metabase
      await moveCollectionItemToSyncedCollection(page, "Orders");

      // Make a change outside metabase
      updateRemoteQuestion(repo, (doc) => {
        doc.name = "Sloan for Frontend Emperor";
        return doc;
      });

      await clickPushOption(page);

      // The remote has advanced, so pushing opens the conflict modal directly.
      const dialog = page.getByRole("dialog", { name: /remote branch/ });
      await dialog
        .getByRole("radio", {
          name: /Create a new branch and push changes there/,
        })
        .click();
      await dialog.getByPlaceholder("your-branch-name").fill(NEW_BRANCH);
      await dialog.getByRole("button", { name: "Push changes" }).click();

      await waitForTask(page, { taskName: "export" });

      // Ensure that we are on the newly created branch
      await expect(getGitSyncControls(page)).toContainText(NEW_BRANCH);
      await goToSyncedCollection(page);

      await expect(
        collectionTable(page).getByText("Orders", { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText("Remote Sync Test Question", {
          exact: true,
        }),
      ).toBeVisible();

      // Switch back to main from Settings (local is synced after stashing).
      await switchBranchViaSettings(page, "main");
      await waitForTask(page, { taskName: "import" });

      // Upstream change gets pulled when switching branches
      await page.goto("/collection/root");
      await goToSyncedCollection(page);
      await expect(
        collectionTable(page).getByText("Sloan for Frontend Emperor", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test.describe("Branching", () => {
      let branchCount = 0;

      test.beforeEach(() => {
        branchCount = 0;
      });

      const createNewBranch = async (
        mb: SnowplowCapable,
        page: import("@playwright/test").Page,
        newBranchName: string,
      ) => {
        branchCount++;
        await createBranchViaSettings(page, newBranchName);

        await expectUnstructuredSnowplowEvent(
          mb,
          {
            event: "remote_sync_branch_created",
            triggered_from: "branch-picker",
          },
          branchCount,
        );

        await expect(getSettingsBranchSwitcher(page)).toContainText(
          newBranchName,
        );
      };

      const pushUpdates = async (page: import("@playwright/test").Page) => {
        await clickPushOption(page);
        await modal(page).getByRole("button", { name: /Push changes/ }).click();
        await waitForTask(page, { taskName: "export" });
        // Push button should be disabled when local changes are synced
        await expect(await getPushOption(page)).toHaveAttribute(
          "data-combobox-disabled",
          "true",
        );
      };

      test("should allow you to create new branches and switch between them", async ({
        page,
        mb,
      }) => {
        await configureGitWithNewSyncedCollection(mb.api, repo, "read-write");

        const NEW_BRANCH_1 = `new-branch-${Date.now()}`;
        const NEW_BRANCH_2 = `new-branch-${Date.now() + 1}`;

        await page.goto("/collection/root");

        await navigationSidebar(page)
          .getByRole("treeitem", { name: /Test Synced Collection/ })
          .click();

        // Test Synced Collection starts empty
        await expect(collectionTable(page)).toHaveCount(0);
        await expect(page.getByTestId("collection-empty-state")).toBeVisible();

        await createNewBranch(mb, page, NEW_BRANCH_1);

        // Move something into synced collection for the new branch
        await page.goto("/collection/root");
        await moveCollectionItemToSyncedCollection(
          page,
          "Orders, Count",
          "Test Synced Collection",
        );

        await pushUpdates(page);

        // Create a second branch (off the first) and add different content
        await createNewBranch(mb, page, NEW_BRANCH_2);

        await page.goto("/collection/root");
        await moveCollectionItemToSyncedCollection(
          page,
          "Orders Model",
          "Test Synced Collection",
        );

        await expect(
          collectionTable(page).getByText("Orders, Count", { exact: true }),
        ).toBeVisible();
        await expect(
          collectionTable(page).getByText("Orders Model", { exact: true }),
        ).toBeVisible();
        await pushUpdates(page);

        // Go back to the first branch (clean, so it switches directly)
        await switchBranchViaSettings(page, NEW_BRANCH_1);
        await waitForTask(page, { taskName: "import" });

        await expectUnstructuredSnowplowEvent(mb, {
          event: "remote_sync_branch_switched",
          triggered_from: "admin-settings",
        });

        await page.goto("/collection/root");
        await goToSyncedCollection(page, "Test Synced Collection");
        await expect(
          collectionTable(page).getByText("Orders, Count", { exact: true }),
        ).toBeVisible();
        // The second item should not exist in the first branch
        await expect(
          collectionTable(page).getByText("Orders Model", { exact: true }),
        ).toHaveCount(0);
      });

      test("should show a popup when trying to switch branches with unsynced changes", async ({
        page,
        mb,
      }) => {
        await configureGitWithNewSyncedCollection(mb.api, repo, "read-write");

        const NEW_BRANCH = `new-branch-${Date.now()}`;

        await page.goto("/collection/root");

        await navigationSidebar(page)
          .getByRole("treeitem", { name: /Test Synced Collection/ })
          .click();

        await expect(collectionTable(page)).toHaveCount(0);
        await expect(page.getByTestId("collection-empty-state")).toBeVisible();

        await createNewBranch(mb, page, NEW_BRANCH);

        // Move something into synced collection for the new branch
        await page.goto("/collection/root");
        await moveCollectionItemToSyncedCollection(
          page,
          "Orders, Count",
          "Test Synced Collection",
        );

        // Attempt to go back to main from Settings — wait for the dirty warning
        // so the switch opens the choose-what-to-do modal.
        await visitRemoteSyncSettings(page);
        const dirtyWarning = page.getByTestId("branch-switcher-dirty-warning");
        await dirtyWarning.scrollIntoViewIfNeeded();
        await expect(dirtyWarning).toBeVisible();
        await getSettingsBranchSwitcher(page).click();
        const branchInput = popover(page).getByPlaceholder(
          "Find or create a branch...",
        );
        await branchInput.click();
        await branchInput.pressSequentially("main");
        await popover(page).getByRole("option", { name: "main" }).click();

        // Check that we haven't switched to main yet
        await expect(getSettingsBranchSwitcher(page)).not.toContainText("main");

        const dialog = modal(page);
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole("heading", {
            name: "You have unsynced changes. What do you want to do?",
          }),
        ).toBeVisible();
        await expect(
          dialog.getByLabel(`Push changes to the current branch, ${NEW_BRANCH}`),
        ).toBeVisible();
        await expect(
          dialog.getByLabel("Create a new branch and push changes there"),
        ).toBeVisible();

        // Choose discard so that we can switch later
        await dialog
          .getByLabel(/Delete unsynced changes \(can.t be undone\)/)
          .click();
        await dialog
          .getByRole("button", { name: /Delete unsynced changes/ })
          .click();

        await waitForTask(page, { taskName: "import" });

        // Now we switched to main
        await expect(getSettingsBranchSwitcher(page)).toContainText("main");
      });
    });

    test.describe("unsynced changes", () => {
      test.beforeEach(async ({ page, mb }) => {
        copySyncedCollectionFixture(repo);
        commitToRepo(repo);
        await configureGitAndPullChanges(mb.api, repo, "read-write");
        await wrapSyncedCollection(mb.api);

        await page.goto("/collection/root");

        // Ensure remote is ahead of us so the pull button is enabled
        updateRemoteQuestion(repo, (doc) => {
          doc.description = "Sloan for Frontend Emperor";
          return doc;
        });

        // Make a change in metabase
        await moveCollectionItemToSyncedCollection(page, "Orders");

        await goToSyncedCollection(page);
        await clickPullOption(page);
      });

      test("can force push changes", async ({ page }) => {
        const dialog = page.getByRole("dialog", { name: /unsynced changes/ });
        await dialog
          .getByRole("radio", { name: /Force push to main/ })
          .click();
        await dialog.getByRole("button", { name: /Push changes/ }).click();

        await waitForTask(page, { taskName: "export" });

        await expect(getGitSyncControls(page)).toContainText("main");
        await expect(
          collectionTable(page).getByText("Orders", { exact: true }),
        ).toBeVisible();
        await expect(
          collectionTable(page).getByText(REMOTE_QUESTION_NAME, { exact: true }),
        ).toBeVisible();
      });

      test("can stash changes to a new branch", async ({ page }) => {
        const NEW_BRANCH = `new-branch-${Date.now()}`;
        const dialog = page.getByRole("dialog", { name: /unsynced changes/ });
        await dialog.getByRole("radio", { name: /new branch/ }).click();
        await dialog.getByPlaceholder("your-branch-name").fill(NEW_BRANCH);
        await dialog.getByRole("button", { name: /Push changes/ }).click();

        await waitForTask(page, { taskName: "export" });

        await expect(getGitSyncControls(page)).toContainText(NEW_BRANCH);
        await expect(
          collectionTable(page).getByText("Orders", { exact: true }),
        ).toBeVisible();
        await expect(
          collectionTable(page).getByText(REMOTE_QUESTION_NAME, { exact: true }),
        ).toBeVisible();

        // waitForTask above already closed the sync confirmation modal.
        await expect(modal(page)).toHaveCount(0);

        // Switch back to main from Settings (clean after stashing).
        await switchBranchViaSettings(page, "main");

        await waitForTask(page, { taskName: "import" });
        await page.goto("/collection/root");
        await goToSyncedCollection(page);
        await expect(
          collectionTable(page).getByText("Orders", { exact: true }),
        ).toHaveCount(0);
        await expect(
          collectionTable(page).getByText(REMOTE_QUESTION_NAME, { exact: true }),
        ).toBeVisible();
      });

      test("can delete/discard changes", async ({ page }) => {
        const dialog = page.getByRole("dialog", { name: /unsynced changes/ });
        await dialog.getByRole("radio", { name: /Delete/ }).click();
        await dialog
          .getByRole("button", { name: "Delete unsynced changes" })
          .click();

        await waitForTask(page, { taskName: "import" });

        await expect(getGitSyncControls(page)).toContainText("main");
        await expect(
          collectionTable(page).getByText("Orders", { exact: true }),
        ).toHaveCount(0);
        await expect(
          collectionTable(page).getByText(REMOTE_QUESTION_NAME, { exact: true }),
        ).toBeVisible();
      });
    });
  });

  // -------------------------------------------------------------------------
  // remote sync admin settings page — default snapshot, runs on the jar.
  // -------------------------------------------------------------------------
  test.describe("remote sync admin settings page", () => {
    let repo: RemoteSyncRepo;

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      // Cypress activated the token before signing in (its cy.request rode an
      // implicit cookie session); the Playwright api client needs an explicit
      // session, so sign in first — same effective state, no 402.
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      repo = setupGitSync();
    });

    test.afterEach(() => {
      teardownGitSync(repo);
    });

    test("can set up read-write mode", async ({ page, mb }) => {
      await page.goto("/admin/settings/remote-sync");
      const urlField = page.getByLabel(/repository url/i);
      await expect(urlField).toBeVisible();
      await urlField.click();
      await urlField.clear();
      await urlField.fill(repo.url);
      await page
        .getByTestId("admin-layout-content")
        .getByText("Read-write", { exact: true })
        .click();
      await page.getByRole("button", { name: "Set up remote sync" }).click();

      await expectUnstructuredSnowplowEvent(mb, {
        event: "remote_sync_settings_changed",
        triggered_from: "admin-settings",
      });

      await expect(
        page
          .getByTestId("admin-layout-content")
          .getByText("Success", { exact: true }),
      ).toBeVisible();

      await expect(modal(page)).toHaveCount(0);
      await page.goto("/");

      // Branch picker appears in the app bar (doesn't require import)
      await expect(getGitSyncControls(page)).toContainText("main");
    });

    test("can set up read-only mode", async ({ page }) => {
      // Set up a Synced Collection to connect to, otherwise read-only is empty
      copySyncedCollectionFixture(repo);
      commitToRepo(repo);

      await page.goto("/admin/settings/remote-sync");
      const urlField = page.getByLabel(/repository url/i);
      await expect(urlField).toBeVisible();
      await urlField.click();
      await urlField.clear();
      await urlField.fill(repo.url);

      await page
        .getByTestId("admin-layout-content")
        .getByText("Read-only", { exact: true })
        .click();
      await page.getByRole("button", { name: "Set up remote sync" }).click();
      await expect(
        page
          .getByTestId("admin-layout-content")
          .getByText("Success", { exact: true }),
      ).toBeVisible();

      // Read-only setup runs an initial import; close its modal (GHY-3747).
      await closeSyncResultModal(page);
      await expect(modal(page)).toHaveCount(0);
      await page.goto("/");

      // In read-only mode, git sync controls are not visible in app bar
      await expect(getGitSyncControls(page)).toHaveCount(0);

      await navigationSidebar(page)
        .getByRole("treeitem", { name: /Synced Collection/ })
        .click();
    });

    test("should disable 'Set up remote sync' button if git url is not set (#65653)", async ({
      page,
    }) => {
      await page.goto("/admin/settings/remote-sync");
      await expect(
        page.getByRole("button", { name: "Set up remote sync" }),
      ).toBeDisabled();

      await page
        .getByRole("switch", { name: /Auto-sync with git/ })
        .click({ force: true });

      // Trivial dirty state should not be enough to enable the button
      await expect(
        page.getByRole("button", { name: "Set up remote sync" }),
      ).toBeDisabled();

      const tokenField = page.getByLabel(/Access Token/i);
      await expect(tokenField).toBeVisible();
      await tokenField.click();
      await tokenField.clear();
      await tokenField.fill("SecretToken");
      // Still disabled - url is not set
      await expect(
        page.getByRole("button", { name: "Set up remote sync" }),
      ).toBeDisabled();

      const urlField = page.getByLabel(/repository url/i);
      await urlField.scrollIntoViewIfNeeded();
      await expect(urlField).toBeVisible();
      await urlField.click();
      await urlField.clear();
      await urlField.fill(repo.url);

      // Enabled now - url is set
      await expect(
        page.getByRole("button", { name: "Set up remote sync" }),
      ).toBeEnabled();
    });

    test("shows an error if git settings are invalid", async ({ page }) => {
      const saveSettings = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/ee/remote-sync/settings" &&
          r.request().method() === "PUT",
      );
      await page.goto("/admin/settings/remote-sync");
      const urlField = page.getByLabel(/repository url/i);
      await expect(urlField).toBeVisible();
      await urlField.click();
      await urlField.clear();
      await urlField.fill("file://invalid-path");
      await page.getByRole("button", { name: "Set up remote sync" }).click();

      const response = await saveSettings;
      expect(response.status()).toBe(400);
      await expect(
        page
          .getByTestId("admin-layout-content")
          .getByText("Failed", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("admin-layout-content")
          .getByText(
            "Failed to clone git repository: Git CloneCommand failed: URI not supported: file://invalid-path",
            { exact: true },
          ),
      ).toBeVisible();
    });

    test("can deactivate remote sync", async ({ page, mb }) => {
      copySyncedCollectionFixture(repo);
      commitToRepo(repo);
      await configureGitAndPullChanges(mb.api, repo, "read-write");

      await page.goto("/admin/settings/remote-sync");

      await page.getByRole("button", { name: /Disable remote sync/ }).click();

      await expect(
        modal(page).getByRole("heading", { name: "Disable Remote Sync?" }),
      ).toBeVisible();
      await modal(page).getByRole("button", { name: "Disable" }).click();

      await expectUnstructuredSnowplowEvent(mb, {
        event: "remote_sync_deactivated",
        triggered_from: "admin-settings",
      });

      await expect(
        page
          .getByTestId("admin-layout-content")
          .getByText("Enabled", { exact: true }),
      ).toHaveCount(0);

      await page.goto("/");

      await expect(
        navigationSidebar(page).getByRole("treeitem", {
          name: /Synced Collection/,
        }),
      ).toBeVisible();
    });
  });

  // -------------------------------------------------------------------------
  // read-only mode — default snapshot, runs on the jar.
  // -------------------------------------------------------------------------
  test.describe("read-only mode", () => {
    let repo: RemoteSyncRepo;

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      repo = setupGitSync();
    });

    test.afterEach(() => {
      teardownGitSync(repo);
    });

    test("can change branches", async ({ page, mb }) => {
      const UPDATED_REMOTE_QUESTION_NAME = "New Name";

      copySyncedCollectionFixture(repo);
      commitToRepo(repo);
      await configureGit(mb.api, repo, "read-only");

      await page.goto("/");

      await navigationSidebar(page)
        .getByRole("treeitem", { name: /Synced Collection/ })
        .click();
      await expect(
        collectionTable(page).getByText(REMOTE_QUESTION_NAME, { exact: true }),
      ).toBeVisible();

      // Make a change and commit it to the branch
      checkoutSyncedCollectionBranch(repo, "test");
      updateRemoteQuestion(repo, (doc) => {
        doc.name = UPDATED_REMOTE_QUESTION_NAME;
        return doc;
      });

      await page.goto("/admin/settings/remote-sync");
      // getByLabel("Sync branch") also matches the Auto-sync switch; target the
      // textbox by role (findByLabelText was exact upstream).
      const branchField = page.getByRole("textbox", { name: "Sync branch" });
      await branchField.scrollIntoViewIfNeeded();
      await branchField.clear();
      await branchField.fill("test");
      await page.getByTestId("remote-sync-submit-button").click();

      await expect(
        page
          .getByTestId("admin-layout-content")
          .getByText("Success", { exact: true }),
      ).toBeVisible();

      await page
        .getByRole("dialog", { name: "Switch branches?" })
        .getByRole("button", { name: "Continue" })
        .click();

      await waitForTask(page, { taskName: "import" });

      await expect(
        page.getByTestId("remote-sync-submit-button"),
      ).toBeDisabled();

      await page.goto("/");

      await navigationSidebar(page)
        .getByRole("treeitem", { name: /Synced Collection/ })
        .click();
      await expect(
        collectionTable(page).getByText(UPDATED_REMOTE_QUESTION_NAME, {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("keeps the Embed sharing option available for a question in a read-only synced collection (metabase#72752)", async ({
      page,
      mb,
    }) => {
      copySyncedCollectionFixture(repo);
      commitToRepo(repo);
      // Enable static embedding instance-wide so the Embed option is offered.
      await mb.api.updateSetting("enable-embedding-static", true);
      await configureGitAndPullChanges(mb.api, repo, "read-only");

      await page.goto("/");

      await navigationSidebar(page)
        .getByRole("treeitem", { name: /Synced Collection/ })
        .click();
      await collectionTable(page)
        .getByText(REMOTE_QUESTION_NAME, { exact: true })
        .click();

      // The Embed option stays available on a read-only synced question; the
      // Publish button inside the modal is disabled instead (unit-tested).
      await openSharingMenu(page);
      await expect(
        sharingMenu(page).getByText("Embed", { exact: true }),
      ).toBeVisible();
    });
  });

  // -------------------------------------------------------------------------
  // shared tenant collections — default snapshot + tenants, runs on the jar.
  // -------------------------------------------------------------------------
  test.describe("shared tenant collections", () => {
    let repo: RemoteSyncRepo;

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      repo = setupGitSync();
      await enableTenants(mb.api);
    });

    test.afterEach(() => {
      teardownGitSync(repo);
    });

    test.describe("admin settings", () => {
      test("should show shared tenant collections section when tenants are enabled and remote sync is configured", async ({
        page,
        mb,
      }) => {
        await configureGitAndPullChanges(mb.api, repo, "read-write");

        await createSharedTenantCollection(mb.api, "Tenant A Shared");
        await createSharedTenantCollection(mb.api, "Tenant B Shared");

        await page.goto("/admin/settings/remote-sync");

        const content = page.getByTestId("admin-layout-content");
        await expect(
          content.getByText("Collections to sync", { exact: true }),
        ).toBeVisible();
        await expect(
          content.getByText("Shared collections", { exact: true }),
        ).toBeVisible();
        await expect(
          content.getByText("Tenant A Shared", { exact: true }),
        ).toBeVisible();
        await expect(
          content.getByText("Tenant B Shared", { exact: true }),
        ).toBeVisible();
        expect(await content.getByRole("switch").count()).toBeGreaterThanOrEqual(
          2,
        );
      });

      test("should not show shared tenant collections section when tenants are disabled", async ({
        page,
        mb,
      }) => {
        await mb.api.put("/api/setting/use-tenants", { value: false });

        await configureGitAndPullChanges(mb.api, repo, "read-write");
        await page.goto("/admin/settings/remote-sync");

        await expect(
          page
            .getByTestId("admin-layout-content")
            .getByText("Shared collections", { exact: true }),
        ).toHaveCount(0);
      });

      test("should not show shared tenant collections section when remote sync is not enabled", async ({
        page,
      }) => {
        await page.goto("/admin/settings/remote-sync");

        await expect(
          page
            .getByTestId("admin-layout-content")
            .getByText("Collections to sync", { exact: true }),
        ).toHaveCount(0);
      });

      test("should show empty state when no shared tenant collections exist", async ({
        page,
        mb,
      }) => {
        await configureGitAndPullChanges(mb.api, repo, "read-write");
        await page.goto("/admin/settings/remote-sync");

        const content = page.getByTestId("admin-layout-content");
        await expect(
          content.getByText("Shared collections", { exact: true }),
        ).toBeVisible();
        await expect(
          content.getByText("No shared tenant collections found", {
            exact: true,
          }),
        ).toBeVisible();
      });

      test("can toggle sync for a shared tenant collection", async ({
        page,
        mb,
      }) => {
        await configureGitAndPullChanges(mb.api, repo, "read-write");

        await createSharedTenantCollection(mb.api, "Tenant Collection To Sync");

        await page.goto("/admin/settings/remote-sync");

        const content = page.getByTestId("admin-layout-content");
        await content
          .getByRole("switch", { name: "Sync Tenant Collection To Sync" })
          .click({ force: true });

        await content.getByRole("button", { name: "Save changes" }).click();

        await expect(content.getByText(/success/i).first()).toBeVisible();
      });

      test("should disable sync toggles in read-only mode", async ({
        page,
        mb,
      }) => {
        copySyncedCollectionFixture(repo);
        commitToRepo(repo);
        // Wait for the read-only import to finish before creating the tenant
        // collection: racing their two collection-permission revision bumps
        // triggers a primary-key 500.
        await configureGitAndPullChanges(mb.api, repo, "read-only");

        await createSharedTenantCollection(mb.api, "Read Only Tenant Collection");

        await page.goto("/admin/settings/remote-sync");

        await expect(
          page
            .getByTestId("admin-layout-content")
            .getByRole("switch", { name: "Sync Read Only Tenant Collection" }),
        ).toBeDisabled();
      });

      test("should reset collection toggles when switching from read-write to read-nly", async ({
        page,
        mb,
      }) => {
        copySyncedCollectionFixture(repo);
        commitToRepo(repo);
        await configureGitAndPullChanges(mb.api, repo, "read-write");

        await createSharedTenantCollection(mb.api, "Mode Switch Test Collection");

        await page.goto("/admin/settings/remote-sync");

        const content = page.getByTestId("admin-layout-content");
        await content
          .getByRole("switch", { name: "Sync Mode Switch Test Collection" })
          .click({ force: true });

        await expect(
          content.getByRole("switch", {
            name: "Sync Mode Switch Test Collection",
          }),
        ).toBeChecked();

        await content.getByText("Read-only", { exact: true }).click();

        await expect(
          content.getByRole("switch", {
            name: "Sync Mode Switch Test Collection",
          }),
        ).not.toBeChecked();
      });
    });

    test.describe("syncing tenant collections", () => {
      test("can push changes from a synced tenant collection", async ({
        page,
        mb,
      }) => {
        await configureGitAndPullChanges(mb.api, repo, "read-write");

        const tenantCollection = await createSharedTenantCollection(
          mb.api,
          "Syncable Tenant Collection",
        );

        // Enable sync for this collection via admin settings
        await page.goto("/admin/settings/remote-sync");
        const content = page.getByTestId("admin-layout-content");
        await content
          .getByRole("switch", { name: "Sync Syncable Tenant Collection" })
          .click({ force: true });
        await content.getByRole("button", { name: "Save changes" }).click();

        // Create a question in the tenant collection
        await createQuestion(mb.api, {
          name: "Tenant Question",
          query: { "source-table": PRODUCTS_ID },
          collection_id: tenantCollection.id,
        });

        await page.goto("/");

        await expect(getSyncStatusIndicators(page).first()).toBeVisible();

        await clickPushOption(page);
        await modal(page).getByRole("button", { name: /Push changes/ }).click();
        await waitForTask(page, { taskName: "export" });

        await expect(
          navigationSidebar(page)
            .getByRole("link", { name: /Syncable Tenant Collection/ })
            .getByTestId("remote-sync-status"),
        ).toHaveCount(0);
      });

      test("shows sync status badge on synced tenant collections in sidebar", async ({
        page,
        mb,
      }) => {
        await configureGitAndPullChanges(mb.api, repo, "read-write");

        const tenantCollection = await createSharedTenantCollection(
          mb.api,
          "Badge Test Collection",
        );

        // Enable sync
        await page.goto("/admin/settings/remote-sync");
        const content = page.getByTestId("admin-layout-content");
        await content
          .getByRole("switch", { name: "Sync Badge Test Collection" })
          .click({ force: true });
        await content.getByRole("button", { name: "Save changes" }).click();

        // Create content to trigger dirty state
        await createQuestion(mb.api, {
          name: "Status Badge Test Question",
          query: { "source-table": PRODUCTS_ID },
          collection_id: tenantCollection.id,
        });

        await page.goto("/");

        await expect(
          navigationSidebar(page)
            .getByRole("treeitem", { name: /Badge Test Collection/ })
            .getByTestId("remote-sync-status"),
        ).toBeVisible();
      });
    });
  });

  // -------------------------------------------------------------------------
  // initial pull conflict handling — writable QA postgres, gated.
  // -------------------------------------------------------------------------
  test.describe("initial pull conflict handling", () => {
    test.skip(
      !hasQaDb,
      "drives the writable QA postgres + postgres-writable snapshot; set PW_QA_DB_ENABLED",
    );

    let repo: RemoteSyncRepo;

    test.beforeEach(async ({ mb }) => {
      await mb.restore("postgres-writable");
      await resetSnowplow(mb);
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await mb.api.updateSetting("transforms-enabled", true);
      repo = setupGitSync();

      // Create a local transform that could be overwritten by the remote
      await createSqlTransform(mb.api, {
        sourceQuery: "SELECT 1",
        targetTable: "existing_transform",
        targetSchema: "public",
        name: "Batman's Existing Transform",
      });

      // Create the target table for the imported transform
      await queryWritableDB(
        "CREATE TABLE IF NOT EXISTS imported_transform (column1 INT);",
      );

      // Resync so Metabase knows about the new table
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: ["imported_transform"],
      });

      // Add collection to remote repository
      copySyncedTransformsCollectionFixture(repo);
      commitToRepo(repo);

      // Set up in read-write mode without marking anything synced, then pull
      await configureGit(mb.api, repo, "read-write");
    });

    test.afterEach(() => {
      teardownGitSync(repo);
    });

    test("shows conflict modal with available options when remote would override local", async ({
      page,
    }) => {
      await page.goto("/data-studio/transforms");

      await expect(
        page.getByRole("treegrid").getByText("Batman's Existing Transform", {
          exact: true,
        }),
      ).toBeVisible();

      await clickPullOption(page);

      // make sure conflict modal is displayed
      await expect(
        modal(page).getByRole("heading", {
          name: /Your local data will be overwritten by the remote branch/,
        }),
      ).toBeVisible();
      await expect(page.getByRole("radio")).toHaveCount(2);
      await expect(
        page.getByLabel(/Create a new branch and push changes there/),
      ).toBeVisible();

      // choose the delete option and pull
      const deleteOption = page.getByLabel(/Delete unsynced changes/);
      await expect(deleteOption).toBeVisible();
      await deleteOption.click();

      await page
        .getByRole("button", { name: "Delete unsynced changes" })
        .click();

      const treegrid = page.getByRole("treegrid");
      // existing transform was removed after pulling from remote
      await expect(
        treegrid.getByText("Batman's Existing Transform", { exact: true }),
      ).toHaveCount(0);
      // remote transform was pulled in
      await expect(
        treegrid.getByText("Imported Simple SQL transform", { exact: true }),
      ).toBeVisible();
    });

    test("can push to a new branch", async ({ page }) => {
      const exportChanges = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/ee/remote-sync/export" &&
          r.request().method() === "POST",
      );
      await page.goto("/data-studio/transforms");
      await clickPullOption(page);

      // wait for the conflict modal to finish rendering before interacting
      await expect(
        modal(page).getByRole("heading", {
          name: /Your local data will be overwritten by the remote branch/,
        }),
      ).toBeVisible();

      // choose the new branch option and push
      const newBranchOption = page.getByLabel(
        /Create a new branch and push changes there/,
      );
      await expect(newBranchOption).toBeVisible();
      await newBranchOption.click();

      const branchNameField = page.getByLabel("Name for your new branch");
      await expect(branchNameField).toBeVisible();
      await branchNameField.fill("new-branch");

      await page.getByRole("button", { name: "Push changes" }).click();

      await exportChanges;
      await waitForTask(page, { taskName: "export" });

      await expect(getGitSyncControls(page)).toHaveText("new-branch");

      await expect(
        page.getByRole("treegrid").getByText("Batman's Existing Transform", {
          exact: true,
        }),
      ).toBeVisible();
    });
  });
});
