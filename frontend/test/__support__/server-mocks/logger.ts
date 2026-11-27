import fetchMock from "fetch-mock";

import type { Log, LoggerPreset } from "metabase-types/api";

export function setupLoggerPresetsEndpoint(response: LoggerPreset[]) {
  fetchMock.get("path:/api/logger/presets", response, {
    name: "logger-presets",
  });
}

export function setupPostLoggerAdjustmentEndpoint() {
  fetchMock.post("path:/api/logger/adjustment", { status: 200 });
}

export function setupDeleteLoggerAdjustmentEndpoint() {
  fetchMock.delete("path:/api/logger/adjustment", { status: 200 });
}

export function setupListLogsEndpoint(logs: Log[]) {
  fetchMock.get("path:/api/logger/logs", logs, { name: "list-logs" });
}
