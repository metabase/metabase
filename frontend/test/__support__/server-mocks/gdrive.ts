import dayjs from "dayjs";
import fetchMock from "fetch-mock";

import type { Settings } from "metabase-types/api";

type Props =
  | {
      status?: never;
      "folder-upload-time"?: never;
      errorCode: number;
    }
  | {
      status: Settings["gsheets"]["status"];
      "folder-upload-time"?: number;
      errorCode?: never;
    };

export function setupGdriveGetFolderEndpoint({
  status,
  errorCode,
  "folder-upload-time": uploadTime,
}: Props) {
  if (status) {
    fetchMock.get(
      "path:/api/ee/gsheets/folder",
      () => {
        return {
          status,
          db_id: 1,
          "folder-upload-time": uploadTime ?? dayjs().unix(),
        };
      },
      { overwriteRoutes: true },
    );
  }

  if (errorCode) {
    fetchMock.get("path:/api/ee/gsheets/folder", errorCode);
  }
}

export function setupGdriveServiceAccountEndpoint(
  email = "service-account123@testing.metabase.com",
) {
  fetchMock.get("path:/api/ee/gsheets/service-account", () => {
    return { email };
  });
}

export function setupGdriveSyncEndpoint() {
  fetchMock.post("path:/api/ee/gsheets/folder/sync", () => {
    return { db_id: 1 };
  });
}
