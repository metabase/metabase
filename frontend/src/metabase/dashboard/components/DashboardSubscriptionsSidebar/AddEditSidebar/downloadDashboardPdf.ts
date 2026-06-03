import { t } from "ttag";

import { openSaveDialog } from "metabase/utils/dom";
import type { DashboardId } from "metabase-types/api";

/**
 * Fetch a server-rendered PDF of the dashboard (the same charts subscriptions render) from
 * `GET /api/dashboard/:id/pdf` and save it via the browser download dialog. Uses the session
 * cookie for auth (`credentials: "include"`).
 */
export async function downloadDashboardPdf(
  dashboardId: DashboardId,
): Promise<void> {
  const response = await fetch(`/api/dashboard/${dashboardId}/pdf`, {
    method: "GET",
    credentials: "include",
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
