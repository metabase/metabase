import fetchMock from "fetch-mock";
import { SetupCheckListItem } from "metabase-types/api";

export function setupErrorSetupEndpoints() {
  fetchMock.post("path:/api/setup", 500);
}

export function setupAdminCheckListEndpoint(items: SetupCheckListItem[]) {
  fetchMock.get("path:/api/setup/admin_checklist", items);
}
