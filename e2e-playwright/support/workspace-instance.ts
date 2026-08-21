/**
 * Helpers for the workspace-instance spec port
 * (e2e/test/scenarios/workspaces/workspace-instance.cy.spec.ts, 287 lines).
 *
 * New module (PORTING rule 9): the shared support modules are imported
 * read-only and never edited. The page objects below are ports of
 * `e2e/support/helpers/e2e-workspace-helpers.ts` — only the four objects this
 * spec uses (WorkspaceListPage, SetupWorkspaceModal, CurrentWorkspacePage,
 * LeaveWorkspaceModal) and only the members it touches. The other objects in
 * that file (NewWorkspaceModal / RenameWorkspaceModal / DeleteWorkspaceModal
 * and the WorkspaceListPage members for them) belong to `workspace-manager`,
 * which is still in the queue; deliberately NOT ported here so that port owns
 * its own surface and this module has no unused exports.
 *
 * TOKEN TIER. Both arms of the `/api/ee/workspace-instance` gate are measured
 * in findings-inbox/workspace-instance.md: it is a HARD gate
 * (`premium-handler … :workspaces` → `+require-premium-feature`), 402 without
 * the feature and 200 with it, and the FE plugin
 * (metabase-enterprise/workspaces/index.ts) registers the /data-studio/
 * workspaces routes only under `hasPremiumFeature("workspaces")`. So the
 * upstream `H.activateToken("bleeding-edge")` is load-bearing on both sides.
 *
 * QA-DATABASE TIER. Upstream is `@external` on both arms: the postgres
 * describe restores `postgres-writable` and drives the writable QA postgres
 * (:5404); the mysql describe restores `mysql-writable` and drives the QA
 * MySQL (:3304). Gated on PW_QA_DB_ENABLED, and meant to EXECUTE — a green run
 * with everything skipped is the failure mode, not the goal (FINDINGS #49).
 */
import { type Locator, type Page, expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { queryWritableDB, resetTestTable } from "./actions-on-dashboards";
import { resetTestTableMultiSchema } from "./data-model";
import { createTransform, runTransformAndWaitForSuccess } from "./dependency-graph";
import { WRITABLE_DB_ID, getTableId, resyncDatabase } from "./schema-viewer";
import { createTestQuery } from "./summarization";
import { modal } from "./ui";

export {
  WRITABLE_DB_ID,
  queryWritableDB,
  resetTestTable,
  resetTestTableMultiSchema,
  resyncDatabase,
};

export const QA_DB_SKIP_REASON =
  "@external — requires the writable QA postgres (:5404) / QA MySQL (:3304) " +
  "containers and their postgres-writable / mysql-writable snapshots " +
  "(set PW_QA_DB_ENABLED)";

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

/**
 * Local stand-in for `AdvancedConfig` (metabase-types/api). The Playwright
 * package deliberately does not import metabase-types (see PORTING.md), and
 * the config is serialised straight to YAML, so a structural type is enough.
 * Kept as narrow as the upstream fixtures so a typo in a spec-level fixture is
 * still a type error.
 */
export type AdvancedConfig = {
  version: number;
  config: {
    databases: {
      name: string;
      engine: string;
      details: Record<string, unknown>;
    }[];
    workspace: {
      name: string;
      databases: Record<
        string,
        {
          input_schemas: string[];
          output: { schema?: string; db?: string };
        }
      >;
    };
  };
};

// ---------------------------------------------------------------------------
// Page objects — ports of e2e/support/helpers/e2e-workspace-helpers.ts
// ---------------------------------------------------------------------------

export const WorkspaceListPage = {
  get: (page: Page): Locator => page.getByTestId("workspace-list-page"),

  visit: async (page: Page) => {
    await page.goto("/data-studio/workspaces");
    await expect(WorkspaceListPage.get(page)).toBeVisible();
  },

  /**
   * Port of `WorkspaceListPage.setupInstanceButton()`
   * (findByRole("button", { name: "Upload a workspace config" })). Rendered by
   * WorkspaceEmptyState, i.e. only when the instance holds no workspaces.
   */
  setupInstanceButton: (page: Page): Locator =>
    WorkspaceListPage.get(page).getByRole("button", {
      name: "Upload a workspace config",
      exact: true,
    }),
};

export const SetupWorkspaceModal = {
  get: (page: Page): Locator => modal(page),

  /**
   * Port of `SetupWorkspaceModal.configInput()`:
   * `SetupWorkspaceModal.get().get('input[type="file"]')`. Mantine's FileInput
   * renders a visually hidden <input type=file>; Playwright's setInputFiles
   * drives hidden inputs directly, which is what upstream's `{ force: true }`
   * on `selectFile` was for.
   */
  configInput: (page: Page): Locator =>
    SetupWorkspaceModal.get(page).locator('input[type="file"]'),

  setupButton: (page: Page): Locator =>
    SetupWorkspaceModal.get(page).getByRole("button", {
      name: "Set up",
      exact: true,
    }),

  /**
   * Port of `SetupWorkspaceModal.uploadConfig(config)` — upstream builds the
   * same `config.yml` in memory with `yaml.dump` and a Cypress Buffer.
   * `js-yaml` is not a dependency of this package; it resolves from the
   * repo-root node_modules (the same module the Cypress helper imports), so
   * the require is lazy — this module must still load when the QA-DB gate is
   * off and nothing calls it.
   */
  uploadConfig: async (page: Page, config: AdvancedConfig) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const yaml = require("js-yaml") as { dump: (value: unknown) => string };
    await SetupWorkspaceModal.configInput(page).setInputFiles({
      name: "config.yml",
      mimeType: "application/yaml",
      buffer: Buffer.from(yaml.dump(config)),
    });
  },
};

export const CurrentWorkspacePage = {
  get: (page: Page): Locator => page.getByTestId("current-workspace-page"),

  visit: async (page: Page) => {
    // Same URL as WorkspaceListPage.visit — the route renders one page or the
    // other depending on whether this instance is inside a workspace.
    await page.goto("/data-studio/workspaces");
    await expect(CurrentWorkspacePage.get(page)).toBeVisible();
  },

  /**
   * Port of `CurrentWorkspacePage.database(name)`
   * (findByRole("region", { name })) — TableRemappingSection renders
   * `<Box role="region" aria-label={database.name}>`.
   */
  database: (page: Page, name: string): Locator =>
    CurrentWorkspacePage.get(page).getByRole("region", {
      name,
      exact: true,
    }),

  leaveButton: (page: Page): Locator =>
    CurrentWorkspacePage.get(page).getByRole("button", {
      name: "Leave workspace",
      exact: true,
    }),
};

export const LeaveWorkspaceModal = {
  get: (page: Page): Locator => modal(page),

  confirmButton: (page: Page): Locator =>
    LeaveWorkspaceModal.get(page).getByRole("button", {
      name: "Leave workspace",
      exact: true,
    }),
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/** Port of H.clearWorkspaceInstanceConfig (api/setWorkspaceInstanceConfig.ts). */
export async function clearWorkspaceInstanceConfig(api: MetabaseApi) {
  // MetabaseApi exposes get/post/put convenience wrappers but no `delete`, so
  // go through `fetch` directly (same status-code enforcement).
  await api.fetch("DELETE", "/api/ee/workspace-instance/current");
}

/**
 * Port of the spec-local `createAndRunTransform` (upstream lines 258-287).
 *
 * Upstream's `H.getTableId({ schema: sourceSchema ?? undefined })` collapses a
 * null schema to "no schema filter"; the ported getTableId takes the same
 * optional `schema` and skips the filter when it is absent, so the mysql arm
 * (which passes null) matches on name alone exactly as upstream does.
 */
export async function createAndRunTransform(
  api: MetabaseApi,
  {
    sourceTable,
    sourceSchema,
    targetTable,
    targetSchema,
    rowCount,
  }: {
    sourceTable: string;
    sourceSchema: string | null;
    targetTable: string;
    targetSchema: string | null;
    rowCount: number;
  },
) {
  const sourceTableId = await getTableId(api, {
    databaseId: WRITABLE_DB_ID,
    name: sourceTable,
    schema: sourceSchema ?? undefined,
  });

  const query = await createTestQuery(api, {
    database: WRITABLE_DB_ID,
    stages: [
      {
        source: { type: "table", id: sourceTableId },
        limit: rowCount,
      },
    ],
  });

  const transform = await createTransform(api, {
    name: "Workspace transform",
    source: { type: "query", query },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name: targetTable,
      schema: targetSchema,
    },
  });

  await runTransformAndWaitForSuccess(api, transform.id);
}
