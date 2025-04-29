import fetchMock, {
  type MockOptionsMethodDelete,
  type MockOptionsMethodGet,
  type MockOptionsMethodPost,
  type MockResponse,
} from "fetch-mock";

import type { LoggerPreset } from "metabase-types/api";

export function setupLoggerPresetsEndpoint(
  response: LoggerPreset[] | MockResponse,
  options?: MockOptionsMethodGet,
) {
  fetchMock.get("path:/api/logger/presets", response, options);
}

export function setupPostLoggerAdjustmentEndpoint(
  response: MockResponse = { status: 200 },
  options?: MockOptionsMethodPost,
) {
  fetchMock.post("path:/api/logger/adjustment", response, options);
}

export function setupDeleteLoggerAdjustmentEndpoint(
  response: MockResponse = { status: 200 },
  options?: MockOptionsMethodDelete,
) {
  fetchMock.delete("path:/api/logger/adjustment", response, options);
}
