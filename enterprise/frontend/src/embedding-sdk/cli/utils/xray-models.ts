import { uuid } from "metabase/lib/uuid";
import type { Dashboard, DashboardId } from "metabase-types/api";

import { propagateErrorResponse } from "./propagate-error-response";

interface Options {
  modelId: number;

  cookie: string;
  instanceUrl: string;
}

export async function createXrayDashboardFromModel(
  options: Options,
): Promise<DashboardId> {
  const { modelId, instanceUrl, cookie = "" } = options;

  // Queries an auto-generated dashboard layout for the model
  const dashboardLoadId = uuid();
  const url = `${instanceUrl}/api/automagic-dashboards/model/${modelId}?&dashboard_load_id=${dashboardLoadId}`;

  let res = await fetch(url, {
    method: "GET",
    headers: { "content-type": "application/json", cookie },
  });

  await propagateErrorResponse(res);

  const dashboardContent = await res.json();

  // Saves the auto-generated dashboard
  res = await fetch(`${instanceUrl}/api/dashboard/save`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(dashboardContent),
  });

  await propagateErrorResponse(res);

  const dashboard: Dashboard = await res.json();

  return dashboard.id;
}
