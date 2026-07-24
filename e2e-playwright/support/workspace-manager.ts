/**
 * Helpers for the workspace-manager spec port
 * (e2e/test/scenarios/workspaces/workspace-manager.cy.spec.ts, 127 lines).
 *
 * NEW module (PORTING rule 9): shared support modules are imported read-only
 * and never edited. The page objects below are ports of
 * `e2e/support/helpers/e2e-workspace-helpers.ts` — specifically the surface
 * that `support/workspace-instance.ts` DELIBERATELY left unported, because it
 * belongs to this spec:
 *
 *   - `NewWorkspaceModal`    (nameInput / databaseCheckbox / createButton)
 *   - `RenameWorkspaceModal` (nameInput / renameButton)
 *   - `DeleteWorkspaceModal` (confirmButton)
 *   - the `WorkspaceListPage` members for the manager flow: newButton,
 *     workspaceList, workspace, workspaceMenuButton, renameMenuItem,
 *     downloadConfigMenuItem, deleteMenuItem
 *
 * `WorkspaceListPage.get`/`visit` are duplicated from workspace-instance.ts
 * rather than imported: that module exports a `WorkspaceListPage` object whose
 * shape is the instance flow's, and extending it would mean editing a module
 * another agent owns. The two definitions are byte-equivalent ports of the same
 * three upstream lines; the duplication is the cost of the no-edit rule.
 *
 * ============================== TOKEN GATE ==============================
 * Traced independently for THIS route rather than inherited from the
 * workspace-instance findings (the two specs hit different route mounts):
 *
 *   - `enterprise/.../api_routes/routes.clj:154` mounts `/workspace-manager`
 *     through `(premium-handler metabase-enterprise.workspaces.api/manager-routes
 *     :workspaces)`. (Line 153 is the neighbouring `/workspace-instance` mount.)
 *   - `:workspaces` is `enable-workspaces?`, a plain `define-premium-feature`
 *     (premium_features/settings.clj:378-380) with NO `:getter` override — so
 *     no `(or (not is-hosted?) …)` short circuit and no split-by-argument.
 *     HARD GATE.
 *   - Measured on this slot (port 4102), two-arm control:
 *     `GET /api/ee/workspace-manager/` → **402** with no token.
 *   - Frontend: `metabase-enterprise/workspaces/index.ts` assigns
 *     `PLUGIN_WORKSPACES.getDataStudioRoutes` only under
 *     `hasPremiumFeature("workspaces")`, so without the token
 *     /data-studio/workspaces does not render the list page at all.
 *
 * BE and FE agree. Upstream's `H.activateToken("bleeding-edge")` is
 * load-bearing on both sides.
 *
 * ============================ QA-DATABASE GATE ============================
 * Upstream is `@external` on both arms: the postgres describe restores
 * `postgres-writable` and drives the writable QA postgres (:5404); the mysql
 * describe restores `mysql-writable` and drives the QA MySQL (:3304). Gated on
 * PW_QA_DB_ENABLED and meant to EXECUTE (FINDINGS #49) — a green run with
 * everything skipped is the failure mode, not the goal. The container gate and
 * the token gate are independent: PW_QA_DB_ENABLED decides whether the test
 * runs at all, the token decides whether the feature works inside it.
 */
import { type Locator, type Page, expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { resetTestTableMultiSchema } from "./data-model";
// Port of cy.deleteDownloadsFolder — already a no-op in this harness
// (Playwright downloads land in per-run temp dirs, so there is no shared
// downloads folder to clear). Imported read-only rather than redefined.
import { deleteDownloadsFolder } from "./embed-resource-downloads";
import { WRITABLE_DB_ID, resyncDatabase } from "./schema-viewer";
import { modal } from "./ui";

export {
  WRITABLE_DB_ID,
  deleteDownloadsFolder,
  resetTestTableMultiSchema,
  resyncDatabase,
};

export const QA_DB_SKIP_REASON =
  "@external — requires the writable QA postgres (:5404) / QA MySQL (:3304) " +
  "containers and their postgres-writable / mysql-writable snapshots " +
  "(set PW_QA_DB_ENABLED)";

// ---------------------------------------------------------------------------
// Page objects — ports of e2e/support/helpers/e2e-workspace-helpers.ts
// ---------------------------------------------------------------------------

/**
 * NAME MATCHING. Every `findByRole(..., { name })` below becomes
 * `getByRole(..., { name, exact: true })`. testing-library matches a string
 * TextMatch against the ACCESSIBLE NAME exactly (full-string, after
 * whitespace normalisation), so `exact: true` is the faithful port — the
 * default `exact: false` would additionally match substrings AND ignore case.
 * The one exception is `downloadConfigMenuItem`, whose upstream matcher is a
 * regex (substring by construction) and is ported as a regex.
 *
 * These are role/accessible-name lookups, not `getByText`, so the
 * `getNodeText`-vs-`textContent` divergence in the brief does not apply here:
 * accessible-name computation is the same tree walk on both sides.
 */
export const WorkspaceListPage = {
  get: (page: Page): Locator => page.getByTestId("workspace-list-page"),

  visit: async (page: Page) => {
    await page.goto("/data-studio/workspaces");
    await expect(WorkspaceListPage.get(page)).toBeVisible();
  },

  /**
   * Port of `WorkspaceListPage.newButton({ primary })`. `primary: true` (the
   * default, and the only variant this spec uses) is the EMPTY-STATE call to
   * action "Create a workspace"; `primary: false` is the "New" button rendered
   * in the header once the instance already holds workspaces. Keeping the
   * parameter preserves the upstream distinction, which is load-bearing for
   * the post-delete assertion: seeing "Create a workspace" specifically proves
   * the empty state rendered.
   */
  newButton: (page: Page, { primary = true }: { primary?: boolean } = {}) =>
    WorkspaceListPage.get(page).getByRole("button", {
      name: primary ? "Create a workspace" : "New",
      exact: true,
    }),

  workspaceList: (page: Page): Locator =>
    WorkspaceListPage.get(page).getByTestId("workspace-list"),

  workspace: (page: Page, name: string): Locator =>
    WorkspaceListPage.get(page).getByRole("region", { name, exact: true }),

  workspaceMenuButton: (page: Page, name: string): Locator =>
    WorkspaceListPage.workspace(page, name).getByRole("button", {
      name: "Workspace options",
      exact: true,
    }),

  // The three menu items are looked up from the PAGE, not from the list page
  // container — upstream uses a bare `cy.findByRole(...)` for exactly this
  // reason: Mantine portals the Menu.Dropdown outside the page subtree.
  renameMenuItem: (page: Page): Locator =>
    page.getByRole("menuitem", { name: "Rename", exact: true }),

  /** Upstream matcher is the regex /Download config\.yml/ — substring. */
  downloadConfigMenuItem: (page: Page): Locator =>
    page.getByRole("menuitem", { name: /Download config\.yml/ }),

  deleteMenuItem: (page: Page): Locator =>
    page.getByRole("menuitem", { name: "Delete", exact: true }),
};

export const NewWorkspaceModal = {
  get: (page: Page): Locator => modal(page),

  nameInput: (page: Page): Locator =>
    NewWorkspaceModal.get(page).getByLabel("Name", { exact: true }),

  databaseCheckbox: (page: Page, name: string): Locator =>
    NewWorkspaceModal.get(page).getByRole("checkbox", { name, exact: true }),

  createButton: (page: Page): Locator =>
    NewWorkspaceModal.get(page).getByRole("button", {
      name: "Create workspace",
      exact: true,
    }),
};

export const RenameWorkspaceModal = {
  get: (page: Page): Locator => modal(page),

  nameInput: (page: Page): Locator =>
    RenameWorkspaceModal.get(page).getByLabel("Name", { exact: true }),

  renameButton: (page: Page): Locator =>
    RenameWorkspaceModal.get(page).getByRole("button", {
      name: "Rename",
      exact: true,
    }),
};

export const DeleteWorkspaceModal = {
  get: (page: Page): Locator => modal(page),

  confirmButton: (page: Page): Locator =>
    DeleteWorkspaceModal.get(page).getByRole("button", {
      name: "Delete workspace",
      exact: true,
    }),
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Port of the spec-local `enableWorkspaces(databaseId)` (upstream 116-122):
 * read the database, then PUT it back with `database-enable-workspaces` merged
 * into its existing settings. The read-modify-write is preserved — PUT
 * replaces the whole `settings` map, so dropping the spread would clobber
 * whatever the snapshot configured.
 */
export async function enableWorkspaces(api: MetabaseApi, databaseId: number) {
  const response = await api.get(`/api/database/${databaseId}`);
  const body = (await response.json()) as {
    settings: Record<string, unknown> | null;
  };
  await api.put(`/api/database/${databaseId}`, {
    settings: { ...body.settings, "database-enable-workspaces": true },
  });
}
