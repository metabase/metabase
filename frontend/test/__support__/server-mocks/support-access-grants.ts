import fetchMock from "fetch-mock";

import type { SupportAccessGrant } from "metabase-types/api";

export function setupCreateAccessGrantEndpoint(
  createdAccessGrant: SupportAccessGrant,
) {
  fetchMock.post("path:/api/ee/support-access-grant", createdAccessGrant);
}

export function setupCreateAccessGrantEndpointWithError(error: string) {
  fetchMock.post("path:/api/ee/support-access-grant", {
    status: 500,
    body: error,
  });
}

export function setupRevokeAccessGrantEndpoint(
  grantId: number,
  revokedGrant: SupportAccessGrant,
) {
  fetchMock.put(
    `path:/api/ee/support-access-grant/${grantId}/revoke`,
    revokedGrant,
  );
}

export function setupRevokeAccessGrantEndpointWithError(grantId: number) {
  fetchMock.put(`path:/api/ee/support-access-grant/${grantId}/revoke`, {
    status: 500,
  });
}

export function setupListAccessGrantsEndpoint(
  accessGrants: SupportAccessGrant[],
  total?: number,
) {
  fetchMock.get("path:/api/ee/support-access-grant", {
    data: accessGrants,
    total: total ?? accessGrants.length,
    limit: 10,
    offset: 0,
  });
}

export function setupListAccessGrantsEndpointWithError(error: string) {
  fetchMock.get("path:/api/ee/support-access-grant", {
    status: 500,
    body: error,
  });
}

export function setupCurrentAccessGrantEndpoint(
  currentGrant: SupportAccessGrant | null,
) {
  fetchMock.get("path:/api/ee/support-access-grant/current", {
    status: currentGrant ? 200 : 204,
    body: currentGrant || "",
  });
}
