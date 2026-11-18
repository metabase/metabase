import fetchMock from "fetch-mock";

import type {
  MfaAdminOverview,
  MfaAdminUser,
  MfaEnrollResponse,
  MfaEnrolledUser,
  MfaStatus,
  MfaUserListResponse,
} from "metabase-types/api";

export function setupMfaStatusEndpoint(status: MfaStatus) {
  fetchMock.get("path:/api/ee/mfa/status", status);
}

export function setupMfaStatusEndpointError() {
  fetchMock.get("path:/api/ee/mfa/status", 500);
}

export function setupMfaEnrollEndpoint(response: MfaEnrollResponse) {
  fetchMock.post("path:/api/ee/mfa/enroll", response);
}

export function setupMfaEnrollEndpointError() {
  fetchMock.post("path:/api/ee/mfa/enroll", 500);
}

export function setupMfaDisableEndpoint() {
  fetchMock.post("path:/api/ee/mfa/disable", 204);
}

export function setupMfaDisableEndpointError() {
  fetchMock.post("path:/api/ee/mfa/disable", 500);
}

export function setupMfaRecoveryCodesEndpoint(recoveryCodes: string[]) {
  fetchMock.post("path:/api/ee/mfa/recovery-codes", {
    recovery_codes: recoveryCodes,
  });
}

export function setupMfaRecoveryCodesEndpointError() {
  fetchMock.post("path:/api/ee/mfa/recovery-codes", 500);
}

export function setupMfaAdminOverviewEndpoint(overview: MfaAdminOverview) {
  fetchMock.get("path:/api/ee/mfa/admin/overview", overview);
}

function userListResponse<T extends MfaAdminUser>(
  users: T[],
): MfaUserListResponse<T> {
  return { data: users, total: users.length, limit: null, offset: null };
}

export function setupMfaEnrolledUsersEndpoint(users: MfaEnrolledUser[]) {
  fetchMock.get(
    "path:/api/ee/mfa/admin/enrolled-users",
    userListResponse(users),
  );
}

export function setupMfaEnrolledUsersEndpointError() {
  fetchMock.get("path:/api/ee/mfa/admin/enrolled-users", 500);
}

export function setupMfaUnenrolledUsersEndpoint(users: MfaAdminUser[]) {
  fetchMock.get(
    "path:/api/ee/mfa/admin/unenrolled-users",
    userListResponse(users),
  );
}

export function setupMfaUnenrolledUsersEndpointError() {
  fetchMock.get("path:/api/ee/mfa/admin/unenrolled-users", 500);
}

export function setupMfaAdminRemoveEndpoint() {
  fetchMock.post("path:/api/ee/mfa/admin/remove", 204);
}

export function setupMfaAdminRemoveEndpointError() {
  fetchMock.post("path:/api/ee/mfa/admin/remove", 500);
}

export function setupMfaVerifyEndpoint() {
  fetchMock.post("path:/api/session/mfa/verify", { id: "session-id" });
}

export function setupMfaVerifyEndpointError() {
  fetchMock.post("path:/api/session/mfa/verify", 500);
}

export function setupMfaEnrollOnLoginEndpoint(recoveryCodes: string[]) {
  fetchMock.post("path:/api/session/mfa/enroll", {
    id: "session-id",
    recovery_codes: recoveryCodes,
  });
}

export function setupMfaEnrollOnLoginEndpointError() {
  fetchMock.post("path:/api/session/mfa/enroll", 401);
}

export function setupMfaSendEmailOtpEndpoint() {
  fetchMock.post("path:/api/session/mfa/send-email-otp", { success: true });
}

function getBodyField(body: unknown, field: string): unknown {
  return typeof body === "object" && body !== null && field in body
    ? Object.getOwnPropertyDescriptor(body, field)?.value
    : undefined;
}

function parseBody(options: { body?: unknown }): unknown {
  return JSON.parse(String(options.body));
}

function matchesUserQuery(user: MfaAdminUser, query: string) {
  const needle = query.toLowerCase();
  return [user.first_name, user.last_name, user.email].some((value) =>
    value?.toLowerCase().includes(needle),
  );
}

/**
 * Filters the unenrolled list by its `query` param the way the API does (first
 * name, last name or email, case-insensitively), so a search only returns the
 * users that match it.
 */
export function setupMfaUnenrolledUsersSearchEndpoint(users: MfaAdminUser[]) {
  fetchMock.get("path:/api/ee/mfa/admin/unenrolled-users", ({ url }) => {
    const query = new URL(url).searchParams.get("query");
    return userListResponse(
      query ? users.filter((user) => matchesUserQuery(user, query)) : users,
    );
  });
}

/**
 * The enrolled list and the admin removal share one store: removing a listed
 * user drops them from the next list response. Removing anyone else is a 404.
 */
export function setupStatefulMfaEnrolledUsersEndpoints(
  users: MfaEnrolledUser[],
) {
  let enrolledUsers = [...users];

  fetchMock.get("path:/api/ee/mfa/admin/enrolled-users", () =>
    userListResponse(enrolledUsers),
  );
  fetchMock.post("path:/api/ee/mfa/admin/remove", ({ options }) => {
    const userId = getBodyField(parseBody(options), "user_id");
    if (!enrolledUsers.some((user) => user.id === userId)) {
      return 404;
    }
    enrolledUsers = enrolledUsers.filter((user) => user.id !== userId);
    return 204;
  });
}

type StatefulMfaAccountOpts = {
  status: MfaStatus;
  password: string;
  code: string;
  enrollResponse: MfaEnrollResponse;
  recoveryCodes: string[];
};

/**
 * The account security endpoints share one enrollment state: disabling with
 * the right `code` un-enrolls, and confirming an enrollment with it enrolls
 * again. A wrong password or code is a 400 that changes nothing.
 */
export function setupStatefulMfaAccountEndpoints({
  status,
  password,
  code,
  enrollResponse,
  recoveryCodes,
}: StatefulMfaAccountOpts) {
  let enrolled = status.enrolled;
  const invalidCode = { status: 400, body: "Invalid authentication code." };

  fetchMock.get("path:/api/ee/mfa/status", () => ({ ...status, enrolled }));
  fetchMock.post("path:/api/ee/mfa/disable", ({ options }) => {
    if (!enrolled || getBodyField(parseBody(options), "code") !== code) {
      return invalidCode;
    }
    enrolled = false;
    return 204;
  });
  fetchMock.post("path:/api/ee/mfa/enroll", ({ options }) =>
    !enrolled && getBodyField(parseBody(options), "password") === password
      ? enrollResponse
      : { status: 400, body: { errors: { password: "Wrong password" } } },
  );
  fetchMock.post("path:/api/ee/mfa/enroll/confirm", ({ options }) => {
    if (enrolled || getBodyField(parseBody(options), "code") !== code) {
      return invalidCode;
    }
    enrolled = true;
    return { recovery_codes: recoveryCodes };
  });
}
