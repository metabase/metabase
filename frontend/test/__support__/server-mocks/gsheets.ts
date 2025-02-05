import fetchMock from "fetch-mock";

import type { Settings } from "metabase-types/api";

type Props =
  | {
      status?: never;
      errorCode: number;
    }
  | {
      status: Settings["gsheets"]["status"];
      errorCode?: never;
    };

export function setupGsheetsGetFolderEndpoint({ status, errorCode }: Props) {
  if (status) {
    fetchMock.get("path:/api/ee/gsheets/folder", () => {
      return {
        status,
        db_id: 1,
      };
    });
  }

  if (errorCode) {
    fetchMock.get("path:/api/ee/gsheets/folder", errorCode);
  }
}
