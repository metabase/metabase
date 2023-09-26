import fetchMock from "fetch-mock";
import type { SetupCheckListItem } from "metabase-types/api";

export function setupErrorSetupEndpoints() {
  fetchMock.post("path:/api/setup", 400);
}

export function setupAdminCheckListEndpoint(items: SetupCheckListItem[]) {
  fetchMock.get("path:/api/setup/admin_checklist", items);
}
