import { pickUpdateDashboardRequest } from "metabase/api/utils/pick";
import type { Dashboard, UpdateDashboardRequest } from "metabase-types/api";

export function updateDashboard(request: UpdateDashboardRequest) {
  return cy.request<Dashboard>(
    "PUT",
    `/api/dashboard/${request.id}`,
    pickUpdateDashboardRequest(request),
  );
}
