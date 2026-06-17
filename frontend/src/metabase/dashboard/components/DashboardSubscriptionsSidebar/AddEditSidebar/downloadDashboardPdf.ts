import { t } from "ttag";

import { openSaveDialog } from "metabase/utils/dom";
import type { DashboardId, Parameter } from "metabase-types/api";

/**
 * Fetch a server-rendered PDF of the dashboard (the same charts subscriptions render) from
 * `POST /api/dashboard/:id/pdf` and save it via the browser download dialog. Uses the session
 * cookie for auth (`credentials: "include"`); normal sessions don't require an anti-CSRF token.
 *
 * `parameters` are optional runtime parameter overrides (the dashboard's parameters with values);
 * any not provided fall back to the dashboard's own defaults.
 */
export async function downloadDashboardPdf(
  dashboardId: DashboardId,
  parameters: Parameter[] = [],
): Promise<void> {
  const response = await fetch(`/api/dashboard/${dashboardId}/pdf`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parameters }),
  });

  if (!response.ok) {
    throw new Error(t`Failed to download dashboard PDF`);
  }

  const contentDisposition = response.headers.get("Content-Disposition");
  const fileNameMatch = contentDisposition?.match(/filename="(.+)"/);
  const fileName = fileNameMatch?.[1] ?? `dashboard-${dashboardId}.pdf`;

  const blob = await response.blob();
  openSaveDialog(fileName, blob);
}
