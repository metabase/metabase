/**
 * Helpers for the admin remote-sync (git-sync) spec port
 * (e2e/test/scenarios/admin/remote-sync.cy.spec.ts).
 *
 * New module per PORTING rule 9 — imports read-only from the shared support
 * modules (ui.ts, api.ts, factories, etc.) and does not edit them. It ports the
 * `H` helpers that live in e2e/support/helpers/e2e-remote-sync-helpers.ts.
 *
 * GIT-SYNC IS NOT INFRA-GATED. Like support/snippets.ts, the git remote is a
 * LOCAL file:// repo created in-process via node:child_process — no external git
 * server. Each test gets its own throwaway repo under $TMPDIR so parallel slots
 * never collide. The remote-sync REST endpoints are `:feature :none`, so they
 * run on the EE jar once the pro-self-hosted token is activated.
 *
 * The two describes that restore the `postgres-writable` snapshot and drive the
 * writable QA postgres (read-write Mode and initial-pull-conflict) additionally
 * gate on PW_QA_DB_ENABLED and SKIP on the jar (PORTING infra-gate rule). The
 * admin-settings, read-only, and shared-tenant describes need only the local
 * git repo + EE token and run on the jar.
 *
 * Port notes:
 * - `H.interceptTask()` (a cy.intercept alias) is DROPPED: the Playwright
 *   `waitForTask` polls the current-task endpoint directly.
 * - `cy.exec("git …")` / `cy.task("copyDirectory"|"readDirectory")` /
 *   `cy.readFile`/`cy.writeFile` → synchronous node:fs / node:child_process,
 *   exactly as support/snippets.ts does it.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { Locator, Page } from "@playwright/test";
import yaml from "js-yaml";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { collectionTable, icon, modal, navigationSidebar, popover } from "./ui";

const REPO_ROOT = resolve(__dirname, "../..");
const SYNCED_COLLECTION_FIXTURE_PATH = join(
  REPO_ROOT,
  "e2e/support/assets/example_synced_collection",
);
const SYNCED_TRANSFORMS_COLLECTION_FIXTURE_PATH = join(
  REPO_ROOT,
  "e2e/support/assets/example_synced_transforms_collection",
);

export const REMOTE_QUESTION_NAME = "Remote Sync Test Question";

// === Local git repo lifecycle ======================================

export type RemoteSyncRepo = {
  /** The repo's working directory. */
  path: string;
  /** The file:// URL the backend clones from. */
  url: string;
};

function git(repo: RemoteSyncRepo, ...args: string[]) {
  return execFileSync("git", ["-C", repo.path, ...args], { stdio: "pipe" });
}

/**
 * Port of H.setupGitSync: create a local git repo with an initial empty commit
 * on `main`. Cypress uses cy.exec against a fixed e2e/tmp/test-repo path reset
 * with `rm -rf`; here each call gets a fresh temp dir so parallel slots don't
 * collide.
 *
 * CI-robustness (support/snippets.ts's git-sync just failed CI): the branch is
 * forced to `main` with `git branch -M main` AFTER the first commit rather than
 * relying on the init default. On a CI box without a global
 * `init.defaultBranch`, plain `git init` creates `master`, but the sync is
 * configured for branch `main` — so the import finds no `main` ref and fails.
 * `git branch -M` renames whatever the initial branch is to `main` on every git
 * version (unlike `git init -b main`, which is rejected by git < 2.28).
 * user.email/user.name are set locally and commit signing is disabled so an
 * inherited `commit.gpgsign=true` can't break the commit on a signing-less CI
 * runner.
 */
export function setupGitSync(): RemoteSyncRepo {
  const path = mkdtempSync(join(tmpdir(), "mb-remote-sync-git-"));
  const repo: RemoteSyncRepo = { path, url: `file://${path}/.git` };
  execFileSync("git", ["init", path], { stdio: "pipe" });
  git(repo, "config", "user.email", "toucan@metabase.com");
  git(repo, "config", "user.name", "Toucan Cam");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "commit", "--allow-empty", "-m", "Initial Commit");
  git(repo, "branch", "-M", "main");
  return repo;
}

/** Remove a repo created by setupGitSync. */
export function teardownGitSync(repo: RemoteSyncRepo | undefined): void {
  if (repo) {
    rmSync(repo.path, { recursive: true, force: true });
  }
}

/** Port of H.copySyncedCollectionFixture (cy.task copyDirectory → fs.cpSync). */
export function copySyncedCollectionFixture(repo: RemoteSyncRepo): void {
  cpSync(SYNCED_COLLECTION_FIXTURE_PATH, repo.path, { recursive: true });
}

/** Port of H.copySyncedTransformsCollectionFixture. */
export function copySyncedTransformsCollectionFixture(
  repo: RemoteSyncRepo,
): void {
  cpSync(SYNCED_TRANSFORMS_COLLECTION_FIXTURE_PATH, repo.path, {
    recursive: true,
  });
}

/** Port of H.commitToRepo: `git add . && git commit -am <message>`. */
export function commitToRepo(
  repo: RemoteSyncRepo,
  message = "Adding content to synced collection",
): void {
  git(repo, "add", ".");
  git(repo, "commit", "-am", message);
}

/** Port of H.checkoutSyncedCollectionBranch: `git checkout -b <branch>`. */
export function checkoutSyncedCollectionBranch(
  repo: RemoteSyncRepo,
  branch: string,
): void {
  git(repo, "checkout", "-b", branch);
}

/**
 * Port of H.stashChanges. When Metabase pushes it writes directly to the .git,
 * not the working tree, so the working tree looks like every file was deleted.
 * `git add . && git stash` resets the working tree to the pushed HEAD. `git
 * stash` is a no-op (exit 0) when there is nothing to stash.
 */
export function stashChanges(repo: RemoteSyncRepo): void {
  git(repo, "add", ".");
  git(repo, "stash");
}

/**
 * Port of H.updateRemoteQuestion: reset the working tree to the pushed HEAD,
 * load remote_sync_test_question.yaml, run the (optional) assertion, apply the
 * mutation, write it back, and commit. Fully synchronous (node fs +
 * child_process) — the Cypress version is the same steps via cy.readFile /
 * cy.writeFile / cy.exec.
 */
export function updateRemoteQuestion(
  repo: RemoteSyncRepo,
  updateFn: (doc: Record<string, unknown>) => Record<string, unknown>,
  assertionsFn?: (doc: Record<string, unknown>) => void,
  commitMessage = "Local Update",
): void {
  stashChanges(repo);
  const relative = (
    readdirSync(repo.path, { recursive: true }) as string[]
  ).find(
    (file) =>
      !file.includes(".git") &&
      file.includes(".yaml") &&
      file.includes("remote_sync_test_question.yaml"),
  );
  if (!relative) {
    throw new Error("remote_sync_test_question.yaml not found in repo");
  }
  const fullPath = join(repo.path, relative);
  const doc = yaml.load(readFileSync(fullPath, "utf8")) as Record<
    string,
    unknown
  >;
  assertionsFn?.(doc);
  const updated = updateFn(doc);
  writeFileSync(fullPath, yaml.dump(updated));
  git(repo, "commit", "-am", commitMessage);
}

// === remote-sync REST configuration ================================

type SyncType = "read-write" | "read-only";

/** Port of H.configureGit: PUT the remote-sync settings pointing at the repo. */
export async function configureGit(
  api: MetabaseApi,
  repo: RemoteSyncRepo,
  syncType: SyncType,
  collections?: Record<number, boolean>,
): Promise<void> {
  await api.put("/api/ee/remote-sync/settings", {
    "remote-sync-branch": "main",
    "remote-sync-type": syncType,
    "remote-sync-url": repo.url,
    "remote-sync-enabled": true,
    ...(collections && { collections }),
  });
}

/**
 * Port of H.configureGitAndPullChanges: configure, then wait for the initial
 * import. Read-only mode auto-triggers the import; read-write needs a manual
 * POST /import first.
 */
export async function configureGitAndPullChanges(
  api: MetabaseApi,
  repo: RemoteSyncRepo,
  syncType: SyncType,
): Promise<void> {
  await configureGit(api, repo, syncType);
  if (syncType === "read-write") {
    // 120s: the FIRST import on a cold JVM (fresh slot backend) measured >30s
    // — the default request timeout — while a warm repeat takes ~2s. Same
    // cold-cost-relocation shape as warmSqlParsingPool (FINDINGS #222).
    await api.post(
      "/api/ee/remote-sync/import",
      { expected_branch: "main" },
      { timeout: 120_000 },
    );
  }
  await pollForTask(api, { taskName: "import" });
}

/** Port of H.configureGitWithNewSyncedCollection. Returns the collection. */
export async function configureGitWithNewSyncedCollection(
  api: MetabaseApi,
  repo: RemoteSyncRepo,
  syncType: SyncType,
  collectionName = "Test Synced Collection",
): Promise<{ id: number; [key: string]: unknown }> {
  const response = await api.post("/api/collection", { name: collectionName });
  const collection = (await response.json()) as {
    id: number;
    [key: string]: unknown;
  };
  await configureGit(api, repo, syncType, { [collection.id]: true });
  return collection;
}

/**
 * Port of H.wrapSyncedCollection: resolve the root-level synced collection
 * created by an import. Retries until it appears (the import is async).
 */
export async function wrapSyncedCollection(
  api: MetabaseApi,
): Promise<{ id: number; name: string; [key: string]: unknown }> {
  for (let attempt = 0; attempt <= 3; attempt++) {
    const response = await api.get("/api/collection");
    const collections = (await response.json()) as {
      id: number;
      name: string;
      is_remote_synced?: boolean;
      location?: string;
    }[];
    const synced = collections.find(
      (c) => c.is_remote_synced && c.location === "/",
    );
    if (synced) {
      return synced;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Could not find Synced Collection");
}

// === task polling ==================================================

type TaskName = "import" | "export";

type CurrentTask = {
  sync_task_type?: TaskName;
  status?: string;
  error_message?: string;
} | null;

/**
 * Port of H.pollForTask: actively GET current-task until the given task
 * completes successfully. Used in setup helpers before the app is loaded.
 */
export async function pollForTask(
  api: MetabaseApi,
  { taskName }: { taskName: TaskName },
): Promise<void> {
  for (let attempt = 0; attempt <= 30; attempt++) {
    const response = await api.get("/api/ee/remote-sync/current-task", {
      failOnStatusCode: false,
    });
    const body = response.ok()
      ? ((await response.json().catch(() => null)) as CurrentTask)
      : null;
    if (body && body.sync_task_type === taskName) {
      if (body.status === "successful") {
        return;
      }
      if (body.status === "errored" || body.status === "conflict") {
        throw new Error(
          `Task ${taskName} ${body.status}: ${body.error_message ?? "unknown"}`,
        );
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Too many retries waiting for ${taskName}`);
}

/**
 * Port of H.waitForTask: wait for a UI-triggered sync to finish by observing
 * the FE's current-task polls, then close the confirmation modal (GHY-3747).
 * Mirrors cy.wait("@currentTask") recursion — waits for a FRESH poll response
 * reporting the task successful, not merely any current successful state (two
 * back-to-back pushes must not resolve on the earlier export).
 */
export async function waitForTask(
  page: Page,
  { taskName }: { taskName: TaskName },
  retries = 0,
): Promise<void> {
  if (retries > 20) {
    throw new Error(`Too many retries waiting for ${taskName}`);
  }
  const response = await page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/ee/remote-sync/current-task" &&
      r.request().method() === "GET",
    { timeout: 30_000 },
  );
  const body = (await response.json().catch(() => null)) as CurrentTask;
  if (body?.status === "errored" || body?.status === "conflict") {
    throw new Error(`Task ${taskName} ${body.status}`);
  }
  if (body?.sync_task_type !== taskName || body?.status !== "successful") {
    return waitForTask(page, { taskName }, retries + 1);
  }
  await closeSyncResultModal(page);
}

/**
 * Port of H.closeSyncResultModal: a UI-triggered sync leaves its confirmation
 * modal open until dismissed (GHY-3747). Close it so the next step isn't
 * blocked by the overlay.
 */
export async function closeSyncResultModal(page: Page): Promise<void> {
  await page
    .getByTestId("sync-success-close-button")
    .click({ timeout: 10_000 });
}

// === app-bar git-sync controls =====================================

/** Port of H.getGitSyncControls (findByTestId "git-sync-controls"). */
export function getGitSyncControls(page: Page): Locator {
  return page.getByTestId("git-sync-controls");
}

async function ensureGitSyncMenuOpen(page: Page): Promise<void> {
  const controls = getGitSyncControls(page);
  if ((await controls.getAttribute("data-expanded")) !== "true") {
    await controls.click();
  }
}

/** Port of H.getPullOption: open the menu, return the Pull option. */
export async function getPullOption(page: Page): Promise<Locator> {
  await ensureGitSyncMenuOpen(page);
  return popover(page).getByRole("option", { name: /Pull changes/ });
}

/** Port of H.getPushOption: open the menu, return the Push option. */
export async function getPushOption(page: Page): Promise<Locator> {
  await ensureGitSyncMenuOpen(page);
  return popover(page).getByRole("option", { name: /Push changes/ });
}

/**
 * Port of H.clickPullOption / clickPushOption. Cypress used realClick + a
 * re-click fallback because Mantine combobox options can drop a synthetic
 * click before the dropdown state machine is wired. Playwright's .click()
 * dispatches native events; we still verify the main menu closed and re-click
 * once if not, matching the upstream fallback.
 */
async function clickGitSyncOption(
  page: Page,
  which: "Pull" | "Push",
): Promise<void> {
  const optionRe = which === "Pull" ? /Pull changes/ : /Push changes/;
  await ensureGitSyncMenuOpen(page);
  const option = popover(page).getByRole("option", { name: optionRe });
  await expect(option).toBeEnabled();
  await option.click();
  // The main menu still showing a Pull/Push option means the click was dropped.
  const mainMenuOption = page
    .getByRole("option", { name: /Pull changes|Push changes/ })
    .filter({ visible: true });
  if ((await mainMenuOption.count()) > 0) {
    await popover(page).getByRole("option", { name: optionRe }).click();
  }
}

export const clickPullOption = (page: Page) => clickGitSyncOption(page, "Pull");
export const clickPushOption = (page: Page) => clickGitSyncOption(page, "Push");

// === Settings-page branch switcher =================================

/** Port of H.visitRemoteSyncSettings. */
export async function visitRemoteSyncSettings(page: Page): Promise<void> {
  await page.goto("/admin/settings/remote-sync");
}

/** Port of H.getSettingsBranchSwitcher. */
export function getSettingsBranchSwitcher(page: Page): Locator {
  return page.getByTestId("settings-branch-switcher");
}

/**
 * Port of the private openSettingsBranchPicker: navigate to Settings, scroll
 * the switcher into view (it sits below the fold), assert visible, open it.
 */
async function openSettingsBranchPicker(page: Page): Promise<void> {
  await visitRemoteSyncSettings(page);
  const switcher = getSettingsBranchSwitcher(page);
  await switcher.scrollIntoViewIfNeeded();
  await expect(switcher).toBeVisible();
  await switcher.click();
}

/** Port of H.createBranchViaSettings: fork+switch to a new branch. */
export async function createBranchViaSettings(
  page: Page,
  name: string,
): Promise<void> {
  await openSettingsBranchPicker(page);
  const input = popover(page).getByPlaceholder("Find or create a branch...");
  await input.click();
  await input.pressSequentially(name);
  await popover(page)
    .getByRole("option", { name: /Create branch/ })
    .click();
}

/**
 * Port of H.switchBranchViaSettings: select an existing branch. With unsaved
 * changes this opens the choose-what-to-do modal instead of switching.
 */
export async function switchBranchViaSettings(
  page: Page,
  branch: string,
): Promise<void> {
  await openSettingsBranchPicker(page);
  const input = popover(page).getByPlaceholder("Find or create a branch...");
  await input.click();
  await input.pressSequentially(branch);
  await popover(page).getByRole("option", { name: branch, exact: true }).click();
}

// === collection movement ===========================================

/** Port of H.getSyncStatusIndicators. */
export function getSyncStatusIndicators(page: Page): Locator {
  return navigationSidebar(page).getByTestId("remote-sync-status");
}

/** Port of H.goToSyncedCollection: click the synced-collection sidebar item. */
export async function goToSyncedCollection(
  page: Page,
  collectionName = "Synced Collection",
): Promise<void> {
  await navigationSidebar(page)
    .getByRole("treeitem", { name: new RegExp(collectionName) })
    .click();
}

/**
 * Port of H.moveCollectionItemToSyncedCollection: from Our analytics, move an
 * item into the synced collection via the Move modal, then confirm the status
 * indicator appears and the item shows up in the target.
 */
export async function moveCollectionItemToSyncedCollection(
  page: Page,
  name: string,
  targetCollection = "Synced Collection",
): Promise<void> {
  await navigationSidebar(page)
    .getByRole("treeitem", { name: /Our analytics/ })
    .click();

  await openCollectionItemMenu(page, name);
  await popover(page).getByText("Move", { exact: true }).click();

  const picker = entityPickerModal(page);
  await entityPickerModalItem(page, 1, targetCollection).click();
  await picker.getByRole("button", { name: "Move", exact: true }).click();

  await expect(getSyncStatusIndicators(page)).toHaveCount(1);

  await navigationSidebar(page)
    .getByRole("treeitem", { name: new RegExp(targetCollection) })
    .click();
  await expect(collectionTable(page).getByText(name, { exact: true })).toBeVisible();
}

// === tenants =======================================================

/** Port of H.enableTenants. */
export async function enableTenants(api: MetabaseApi): Promise<void> {
  await api.put("/api/setting/use-tenants", { value: true });
}

/**
 * Port of H.createSharedTenantCollection. namespace must be
 * "shared-tenant-collection" to match the API query in
 * SharedTenantCollectionsList.
 */
export async function createSharedTenantCollection(
  api: MetabaseApi,
  name: string,
): Promise<{ id: number; [key: string]: unknown }> {
  const response = await api.post("/api/collection", {
    name,
    namespace: "shared-tenant-collection",
  });
  return (await response.json()) as { id: number; [key: string]: unknown };
}

// === small local ports (kept private to this module) ===============

/**
 * Port of H.openCollectionItemMenu (findAllByText(item).eq(index)): the row
 * ellipsis is hover-gated. Mirrors bookmarks-extras.ts openCollectionItemMenu
 * but is kept local so we don't couple to that spec's module.
 */
async function openCollectionItemMenu(
  page: Page,
  item: string,
  index = 0,
): Promise<void> {
  const row = collectionTable(page)
    .getByRole("row")
    .filter({ has: page.getByText(item, { exact: true }) })
    .nth(index);
  await row.hover();
  await icon(row, "ellipsis").click();
}

/** Port of H.entityPickerModal. */
function entityPickerModal(page: Page): Locator {
  return page.getByTestId("entity-picker-modal");
}

/**
 * Port of H.entityPickerModalItem(level, name): the NavLink anchor at the given
 * picker level, excluding the repeated location label.
 */
function entityPickerModalItem(
  page: Page,
  level: number,
  name: string | RegExp,
): Locator {
  return page
    .getByTestId(`item-picker-level-${level}`)
    .getByText(name, { exact: typeof name === "string" })
    .and(page.locator(':not([data-testid="picker-item-location"] *)'))
    .locator("xpath=ancestor-or-self::a[1]");
}
