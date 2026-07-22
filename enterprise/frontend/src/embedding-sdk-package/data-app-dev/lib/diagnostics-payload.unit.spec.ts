import { DATA_APP_DIAGNOSTIC_MAX_CHARS } from "../constants/diagnostics-channel";
import type {
  DevDiagnosticEntry,
  DevDiagnosticEvent,
} from "../types/diagnostics";

import { truncateDiagnosticText } from "./diagnostics-limits";
import { toPayload } from "./diagnostics-payload";

const entry = (event: DevDiagnosticEvent): DevDiagnosticEntry => ({
  id: 1,
  time: 1700000000000,
  ...event,
});

const sdkCall = (
  overrides: Partial<Extract<DevDiagnosticEvent, { kind: "sdk-call" }>> = {},
) =>
  entry({
    kind: "sdk-call",
    method: "POST",
    endpoint: "/api/dataset",
    status: 200,
    durationMs: 12,
    ...overrides,
  });

describe("toPayload for requests", () => {
  it("keeps a successful call off the alert path", () => {
    expect(toPayload(sdkCall())).toMatchObject({
      kind: "sdk-call",
      summary: "POST /api/dataset → 200 (12ms)",
      detail: null,
      alert: false,
    });
  });

  it("files the failure reason as the detail, leaving the endpoint in the summary", () => {
    const payload = toPayload(
      sdkCall({ status: 400, error: 'Table "orders" is not in the manifest' }),
    );

    // The toolbar collapses `detail` and the agent feed carries it as its own
    // field, so the reason must not be folded into the summary line.
    expect(payload.summary).toBe("POST /api/dataset → 400 (12ms)");
    expect(payload.detail).toBe('Table "orders" is not in the manifest');
    expect(payload.alert).toBe(true);
  });

  it("flags a transport failure, which never gets a status", () => {
    const payload = toPayload(
      sdkCall({ status: null, error: "Failed to fetch" }),
    );

    expect(payload.summary).toBe("POST /api/dataset → failed (12ms)");
    expect(payload.detail).toBe("Failed to fetch");
    expect(payload.alert).toBe(true);
  });

  it.each([
    [200, false],
    [304, false],
    // 4xx is the boundary the Queries filter and the toggle badge both key on.
    [399, false],
    [400, true],
    [404, true],
    [500, true],
  ])("treats status %i as an alert: %s", (status, alert) => {
    expect(toPayload(sdkCall({ status })).alert).toBe(alert);
  });

  it("re-caps a reason that outgrew the per-field bound", () => {
    const reason = "x".repeat(DATA_APP_DIAGNOSTIC_MAX_CHARS + 100);

    expect(toPayload(sdkCall({ status: 400, error: reason })).detail).toBe(
      truncateDiagnosticText(reason),
    );
  });

  it("offers no hint for a request — the reason is already the answer", () => {
    expect(toPayload(sdkCall({ status: 400, error: "boom" })).hint).toBeNull();
  });
});
