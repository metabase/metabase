import fetchMock from "fetch-mock";

import type { MonitorRelayStatus } from "metabase-types/api";

const STATUS_ROUTE = "monitor-relay-status";

export function setupMonitorRelayStatusEndpoint(status: MonitorRelayStatus) {
  fetchMock.removeRoute(STATUS_ROUTE);
  fetchMock.get("path:/api/ee/monitor-relay/status", status, {
    name: STATUS_ROUTE,
  });
}

export function setupMonitorRelayStatusErrorEndpoint() {
  fetchMock.removeRoute(STATUS_ROUTE);
  fetchMock.get("path:/api/ee/monitor-relay/status", 500, {
    name: STATUS_ROUTE,
  });
}
