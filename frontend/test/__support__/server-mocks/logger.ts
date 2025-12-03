import fetchMock from "fetch-mock";

import type { LoggerPreset } from "metabase-types/api";

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
