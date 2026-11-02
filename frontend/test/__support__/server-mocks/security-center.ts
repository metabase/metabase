import fetchMock from "fetch-mock";

import type { HealthCheck, HealthCheckId } from "metabase-types/api";

export const setupHealthChecksEndpoint = (checks: HealthCheck[]) => {
  fetchMock.get("path:/api/ee/security-center/health-checks", { checks });
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
) => {
  fetchMock.post(
    `path:/api/ee/security-center/health-checks/${checkId}/recheck`,
    { status: 500 },
  );
};

export const setupRecheckHealthChecksErrorEndpoint = () => {
  fetchMock.post("path:/api/ee/security-center/health-checks/recheck", {
    status: 500,
  });
};
