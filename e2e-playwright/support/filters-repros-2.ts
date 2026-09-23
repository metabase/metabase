/**
 * Helpers for the dashboard-filters-reproductions-2 spec port. New helpers
 * live here (parallel-agent rule: no edits to shared modules). Everything else
 * this spec needs is imported from existing support modules — notably
 * filters-repros.ts (the sibling spec-1 helper surface), dashboard-parameters,
 * dashboard, dashboard-cards, models, metrics, notebook and schema-viewer.
 *
 * Only two genuinely new helpers:
 * - dashboardParametersDoneButton (port of H.dashboardParametersDoneButton,
 *   e2e-dashboard-helpers.ts) — the "Done" button in the parameter sidebar.
 *   CONSOLIDATION NOTE: filters-repros.ts already exposes
 *   dashboardParameterSidebar; this could fold in there next pass.
 * - getManyDataTypesBooleanFieldId (port of the issue-45670 spec-local
 *   getField()): find the writable-postgres `many_data_types.boolean` field id.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { dashboardParameterSidebar } from "./filters-repros";

/**
 * Port of H.dashboardParametersDoneButton: the "Done" button inside the
 * dashboard parameter settings sidebar.
 */
export function dashboardParametersDoneButton(page: Page): Locator {
  return dashboardParameterSidebar(page).getByRole("button", {
    name: "Done",
    exact: true,
  });
}

/**
 * Port of the issue-45670 spec-local getField(): locate the `boolean` field of
 * the writable-postgres `many_data_types` table and return its id.
 */
export async function getManyDataTypesBooleanFieldId(
  api: MetabaseApi,
  tableName = "many_data_types",
): Promise<number> {
  const tables = (await (await api.get("/api/table")).json()) as {
    id: number;
    name: string;
  }[];
  const table = tables.find((table) => table.name === tableName);
  if (!table) {
    throw new Error(`Table "${tableName}" not found`);
  }
  const metadata = (await (
    await api.get(`/api/table/${table.id}/query_metadata`)
  ).json()) as { fields: { id: number; name: string }[] };
  const field = metadata.fields.find((field) => field.name === "boolean");
  if (!field) {
    throw new Error(`Field "boolean" not found on table "${tableName}"`);
  }
  return field.id;
}
