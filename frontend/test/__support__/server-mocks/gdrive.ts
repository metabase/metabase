import fetchMock from "fetch-mock";

import type { GdrivePayload } from "metabase-types/api";

export function setupGdriveGetFolderEndpoint({
  errorCode,
  ...gdrivePayload
}: Partial<GdrivePayload> & { errorCode?: number }) {
  if (errorCode) {
    fetchMock.get("path:/api/ee/gsheets/connection", errorCode, {
      overwriteRoutes: true,
    });
    return;
  }

  fetchMock.get(
    "path:/api/ee/gsheets/connection",
    () => {
      // fetchmock gets confused if you try to return only a 'status' property
      return { ...gdrivePayload, _test: "" };
    },
    { overwriteRoutes: true },
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
