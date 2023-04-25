import fetchMock from "fetch-mock";
import { SetupCheckListItem } from "metabase-types/api";

export function setupAdminCheckListEndpoint(items: SetupCheckListItem[]) {
  fetchMock.get("path:/api/setup/admin_checklist", items);
}
