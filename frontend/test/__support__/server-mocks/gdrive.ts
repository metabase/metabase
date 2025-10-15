import fetchMock from "fetch-mock";

import type { GdrivePayload } from "metabase-types/api";

export function setupGdriveGetFolderEndpoint({
  errorCode,
  ...gdrivePayload
}: Partial<GdrivePayload> & {
  errorCode?: number;
} = {}) {
  fetchMock.removeRoute("gdrive-get-folder");

  if (errorCode) {
    fetchMock.get("path:/api/ee/gsheets/connection", errorCode, {
      name: "gdrive-get-folder",
    });
    return;
  }
  fetchMock.get(
    "path:/api/ee/gsheets/connection",
    () => {
      return { ...gdrivePayload, _test: "" };
    },
    { name: "gdrive-get-folder" },
  );
}

export function setupGdriveServiceAccountEndpoint(
  email = "service-account123@testing.metabase.com",
) {
  fetchMock.get("path:/api/ee/gsheets/service-account", () => {
    return { email };
  });
}

export function setupGdrivePostFolderEndpoint() {
  fetchMock.post("path:/api/ee/gsheets/connection", { status: 202 });
}

export function setupGdriveSyncEndpoint() {
  fetchMock.post("path:/api/ee/gsheets/connection/sync", () => {
    return { db_id: 1 };
  });
}
