import fetchMock from "fetch-mock";

import type { Settings } from "metabase-types/api";

export function setupGsheetsGetFolderEndpoint(
  status: Settings["gsheets"]["status"],
) {
  fetchMock.get("path:/api/ee/gsheets/folder", () => {
    return {
      status,
      db_id: 1,
    };
  });
}
