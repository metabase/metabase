import fetchMock from "fetch-mock";

import type {
  CreateSupportAccessGrantRequest,
  SupportAccessGrant,
} from "metabase-types/api";

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

type AccessGrantsBackendOpts = {
  createdGrantId: number;
  creator: Pick<SupportAccessGrant, "user_id" | "user_name" | "user_email">;
};

function isCreateAccessGrantRequest(
  body: unknown,
): body is CreateSupportAccessGrantRequest {
  return (
    typeof body === "object" &&
    body != null &&
    "grant_duration_minutes" in body &&
    typeof body.grant_duration_minutes === "number"
  );
}

/**
 * The list, current, create and revoke endpoints over one stored list of
 * grants, so that a create or a revoke changes what the next list and current
 * requests return, as the backend does. The list returns rows only for the
 * first page with revoked grants included, which is what the help page asks
 * for, and an empty page for any other query.
 */
export function setupAccessGrantsBackend({
  createdGrantId,
  creator,
}: AccessGrantsBackendOpts) {
  let grants: SupportAccessGrant[] = [];
  const isActive = (grant: SupportAccessGrant) =>
    grant.revoked_at == null &&
    new Date(grant.grant_end_timestamp).getTime() > Date.now();

  fetchMock.get("path:/api/ee/support-access-grant/current", () => {
    const current = grants.find(isActive);
    return current ?? { status: 204, body: "" };
  });

  fetchMock.get("path:/api/ee/support-access-grant", (call) => {
    const params = new URL(call.url).searchParams;
    const isFirstPageWithRevoked =
      params.get("include-revoked") === "true" &&
      params.get("offset") === "0" &&
      params.get("limit") === "10";
    const data = isFirstPageWithRevoked ? grants : [];
    return { data, total: data.length, limit: 10, offset: 0 };
  });

  fetchMock.post("path:/api/ee/support-access-grant", (call) => {
    const body: unknown = JSON.parse(String(call.options.body ?? "{}"));
    if (!isCreateAccessGrantRequest(body)) {
      return { status: 400, body: "Invalid request" };
    }
    if (grants.some(isActive)) {
      return { status: 409, body: "An active grant already exists" };
    }

    const start = new Date();
    const end = new Date(
      start.getTime() + body.grant_duration_minutes * 60 * 1000,
    );
    const grant: SupportAccessGrant = {
      id: createdGrantId,
      ...creator,
      ticket_number: body.ticket_number,
      notes: body.notes,
      grant_start_timestamp: start.toISOString(),
      grant_end_timestamp: end.toISOString(),
      revoked_at: null,
      revoked_by_user_id: null,
      created_at: start.toISOString(),
      updated_at: start.toISOString(),
    };
    grants = [grant, ...grants];
    return grant;
  });

  fetchMock.put(
    `path:/api/ee/support-access-grant/${createdGrantId}/revoke`,
    () => {
      const now = new Date().toISOString();
      grants = grants.map((grant) =>
        grant.id === createdGrantId
          ? {
              ...grant,
              revoked_at: now,
              revoked_by_user_id: creator.user_id,
            }
          : grant,
      );
      const revoked = grants.find((grant) => grant.id === createdGrantId);
      return revoked ?? { status: 404, body: "Not found" };
    },
  );
}
