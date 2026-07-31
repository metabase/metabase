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

export function setupMfaSendEmailOtpEndpoint() {
  fetchMock.post("path:/api/session/mfa/send-email-otp", { success: true });
}
