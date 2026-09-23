/**
 * Helpers for the native/snippets spec port.
 *
 * New module (per the parallel-agent rule) — imports from shared support/*.ts
 * but does not edit them. Folds the spec-local Cypress helpers
 * (createNestedSnippet / createDoublyNestedSnippet / getPermissionsForUserGroup)
 * plus a port of H.codeMirrorValue for the preview modal, and the git-sync
 * setup the read-only describe needs.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { modal } from "./ui";

/** USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js) — a fixed id. */
export const ALL_USERS_GROUP = 1;

/** The subset of the harness these helpers need (fixtures.ts doesn't export the
 * harness type; declare it structurally so we don't edit a shared file). */
type SignInHarness = {
  api: MetabaseApi;
  signInAsAdmin(): Promise<void>;
};

/**
 * Expand a snippet row's detail panel (which reveals the Edit button). The row
 * (SnippetRow.tsx) toggles `isOpen` from the OUTER div's onClick — the chevron
 * inside it has no handler, so Cypress's force-click on the chevron and its
 * `.parent().parent().click()` both just bubble to that div. The chevron is
 * `display:none` until hover (CS.hoverChild), which has no layout box for a
 * real/force click, so we dispatch the click straight at the outer div (the
 * faithful equivalent). Clicking the NAME instead fires insertSnippet, so it
 * must be the outer div, not the Flex. Scoped to the row containing `name`.
 */
export async function openSnippetRow(
  sidebar: Locator,
  name: string,
): Promise<void> {
  const row = sidebar
    .getByText(name, { exact: true })
    .locator(
      "xpath=ancestor::div[.//*[contains(@class,'Icon-chevrondown')]][1]",
    );
  await row.dispatchEvent("click");
}

/**
 * Port of the spec-local getPermissionsForUserGroup:
 * findByText(userGroup).closest("tr").find("[data-testid=permissions-select]").
 */
export function getPermissionsForUserGroup(
  page: Page,
  userGroup: string,
): Locator {
  return modal(page)
    .getByText(userGroup, { exact: true })
    .locator("xpath=ancestor::tr[1]")
    .getByTestId("permissions-select");
}

/**
 * Port of the spec-local createNestedSnippet: sign in as admin, create a
 * top-level snippet folder and a snippet inside it (both via API). The Cypress
 * helper signs in as admin because these endpoints require admin; the browser
 * session is set too, matching cy.request cookie sharing.
 */
export async function createNestedSnippet(mb: SignInHarness): Promise<void> {
  await mb.signInAsAdmin();
  const folder = await mb.api.post("/api/collection", {
    name: "Snippet Folder",
    description: null,
    parent_id: null,
    namespace: "snippets",
  });
  const { id } = (await folder.json()) as { id: number };
  await mb.api.post("/api/native-query-snippet", {
    content: "snippet 1",
    name: "snippet 1",
    collection_id: id,
  });
}

/**
 * Port of the spec-local createDoublyNestedSnippet: Folder A > Folder B >
 * "snippet 1" (all via API, as the current user).
 */
export async function createDoublyNestedSnippet(api: MetabaseApi): Promise<void> {
  const folderA = await api.post("/api/collection", {
    name: "Folder A",
    description: null,
    parent_id: null,
    namespace: "snippets",
  });
  const { id: folderAId } = (await folderA.json()) as { id: number };
  const folderB = await api.post("/api/collection", {
    name: "Folder B",
    description: null,
    parent_id: folderAId,
    namespace: "snippets",
  });
  const { id: folderBId } = (await folderB.json()) as { id: number };
  await api.post("/api/native-query-snippet", {
    content: "snippet 1",
    name: "snippet 1",
    collection_id: folderBId,
  });
}

/**
 * Port of H.codeMirrorValue (e2e-codemirror-helpers.ts): join the editor's
 * .cm-line text nodes with newlines, treating the placeholder as empty.
 * Scoped to the given root (the preview modal). Wrapped in expect.poll by
 * callers since the preview compiles asynchronously.
 */
export async function codeMirrorValue(scope: Locator): Promise<string> {
  const lines = await scope.locator(".cm-line").allTextContents();
  const value = lines.join("\n");
  return value === "SELECT * FROM TABLE_NAME" ? "" : value;
}

// === git-sync setup for the read-only describe ===

/**
 * Port of H.setupGitSync (e2e-remote-sync-helpers.ts): create a local git repo
 * with an initial empty commit. Cypress uses cy.exec; the Playwright test
 * process is Node, so we shell out directly. Returns the file:// URL the
 * backend will clone from. The repo lives in a fresh temp dir per test so
 * parallel slots don't collide.
 */
export function setupGitSync(): string {
  const repoPath = mkdtempSync(join(tmpdir(), "mb-snippet-git-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repoPath, ...args], { stdio: "pipe" });
  execFileSync("git", ["init", repoPath], { stdio: "pipe" });
  git("config", "user.email", "toucan@metabase.com");
  git("config", "user.name", "Toucan Cam");
  git("config", "commit.gpgsign", "false");
  git("commit", "--allow-empty", "-m", "Initial Commit");
  // A CI runner without a global init.defaultBranch creates `master`, but the
  // sync config targets `main` — the import then finds no ref and fails (the
  // batch-7 s18 failure). Force `main`; `branch -M` works on all git versions.
  git("branch", "-M", "main");
  return `file://${repoPath}/.git`;
}

/** Remove a repo created by setupGitSync. */
export function teardownGitSync(syncUrl: string): void {
  const repoPath = syncUrl.replace(/^file:\/\//, "").replace(/\/\.git$/, "");
  rmSync(repoPath, { recursive: true, force: true });
}

/**
 * Port of H.configureGitAndPullChanges (read-only branch): PUT the remote-sync
 * settings pointing at the local repo, then poll for the auto-triggered import
 * task to finish. Mirrors pollForTask.
 */
export async function configureGitAndPullChangesReadOnly(
  api: MetabaseApi,
  syncUrl: string,
): Promise<void> {
  await api.put("/api/ee/remote-sync/settings", {
    "remote-sync-branch": "main",
    "remote-sync-type": "read-only",
    "remote-sync-url": syncUrl,
    "remote-sync-enabled": true,
  });

  // Read-only mode auto-triggers an import; poll current-task until it succeeds.
  for (let attempt = 0; attempt <= 30; attempt++) {
    const response = await api.get("/api/ee/remote-sync/current-task", {
      failOnStatusCode: false,
    });
    const body = response.ok()
      ? ((await response.json().catch(() => null)) as {
          sync_task_type?: string;
          status?: string;
          error_message?: string;
        } | null)
      : null;

    if (body && body.sync_task_type === "import") {
      if (body.status === "successful") {
        return;
      }
      if (body.status === "errored" || body.status === "conflict") {
        throw new Error(
          `import task ${body.status}: ${body.error_message ?? "unknown"}`,
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for remote-sync import task");
}
