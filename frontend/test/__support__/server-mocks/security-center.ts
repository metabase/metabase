import fetchMock from "fetch-mock";

import type { Advisory, HealthCheck, HealthCheckId } from "metabase-types/api";

export const setupSecurityAdvisoriesEndpoint = (advisories: Advisory[]) => {
  fetchMock.get("path:/api/ee/security-center", {
    advisories,
    last_checked_at: null,
  });
};

export const setupHealthChecksEndpoint = (checks: HealthCheck[]) => {
  fetchMock.get(
    "path:/api/ee/security-center/health-checks",
    { checks },
    { name: "health-checks-list" },
  );
};

export const setupHealthChecksErrorEndpoint = () => {
  fetchMock.get("path:/api/ee/security-center/health-checks", { status: 500 });
};

export const setupRecheckHealthCheckEndpoint = (
  checkId: HealthCheckId,
  check: HealthCheck,
) => {
  fetchMock.post(
    `path:/api/ee/security-center/health-checks/${checkId}/recheck`,
    check,
  );
};

export const setupRecheckHealthChecksEndpoint = (checks: HealthCheck[]) => {
  fetchMock.post("path:/api/ee/security-center/health-checks/recheck", {
    checks,
  });
};

export const setupRecheckHealthCheckErrorEndpoint = (
  checkId: HealthCheckId,
  status = 500,
) => {
  fetchMock.post(
    `path:/api/ee/security-center/health-checks/${checkId}/recheck`,
    { status },
  );
};

export const setupRecheckHealthChecksErrorEndpoint = () => {
  fetchMock.post("path:/api/ee/security-center/health-checks/recheck", {
    status: 500,
  });
};
