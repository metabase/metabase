import {
  DATA_APP_DIAGNOSTICS_CALL_LIMIT,
  DATA_APP_DIAGNOSTICS_LIMIT,
  DATA_APP_DIAGNOSTIC_MAX_CHARS,
} from "../constants/diagnostics-channel";

import {
  trimDiagnosticEntries,
  truncateDiagnosticText,
} from "./diagnostics-limits";

const call = (id: number) => ({ kind: "sdk-call", id });
const error = (id: number) => ({ kind: "error", id });
const many = (
  count: number,
  make: (id: number) => { kind: string; id: number },
) => Array.from({ length: count }, (_, index) => make(index + 1));

const kindsOf = (entries: { kind: string }[]) => ({
  calls: entries.filter((entry) => entry.kind === "sdk-call").length,
  rest: entries.filter((entry) => entry.kind !== "sdk-call").length,
});

describe("trimDiagnosticEntries", () => {
  it("returns the very same array while under the limit", () => {
    const entries = many(DATA_APP_DIAGNOSTICS_LIMIT, call);

    expect(trimDiagnosticEntries(entries)).toBe(entries);
  });

  it("leaves a buffer sitting exactly on the limit alone", () => {
    const entries = many(DATA_APP_DIAGNOSTICS_LIMIT, call);

    expect(trimDiagnosticEntries(entries)).toHaveLength(
      DATA_APP_DIAGNOSTICS_LIMIT,
    );
  });

  it("gives the whole buffer to other kinds when there are no requests", () => {
    const trimmed = trimDiagnosticEntries(
      many(DATA_APP_DIAGNOSTICS_LIMIT + 5, error),
    );

    expect(trimmed).toHaveLength(DATA_APP_DIAGNOSTICS_LIMIT);
  });

  it("holds requests to their own budget however loud they get", () => {
    const trimmed = trimDiagnosticEntries([
      error(1),
      ...many(DATA_APP_DIAGNOSTICS_LIMIT * 5, call),
    ]);

    expect(kindsOf(trimmed)).toEqual({
      calls: DATA_APP_DIAGNOSTICS_CALL_LIMIT,
      rest: 1,
    });
  });

  it("keeps the newest of each kind and drops the oldest", () => {
    const calls = many(DATA_APP_DIAGNOSTICS_LIMIT + 10, call);
    const trimmed = trimDiagnosticEntries([error(0), ...calls]);

    const keptCalls = trimmed.filter((entry) => entry.kind === "sdk-call");
    expect(keptCalls.at(-1)).toEqual(calls.at(-1));
    expect(keptCalls[0].id).toBe(
      calls.length - DATA_APP_DIAGNOSTICS_CALL_LIMIT + 1,
    );
  });

  it("preserves insertion order across kinds", () => {
    const interleaved = Array.from(
      { length: DATA_APP_DIAGNOSTICS_LIMIT + 20 },
      (_, index) => (index % 2 === 0 ? call(index) : error(index)),
    );

    const ids = trimDiagnosticEntries(interleaved).map((entry) => entry.id);

    // A poller reads this in order; re-sorting would make ids jump backwards.
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it("can total less than the limit, trading spare room for a bounded request log", () => {
    const trimmed = trimDiagnosticEntries([
      error(1),
      ...many(DATA_APP_DIAGNOSTICS_LIMIT * 2, call),
    ]);

    expect(trimmed.length).toBeLessThan(DATA_APP_DIAGNOSTICS_LIMIT);
  });
});

describe("truncateDiagnosticText", () => {
  it("leaves text within the limit untouched", () => {
    expect(truncateDiagnosticText("short")).toBe("short");
    expect(truncateDiagnosticText("")).toBe("");
  });

  it("leaves text sitting exactly on the limit untouched", () => {
    const exact = "x".repeat(DATA_APP_DIAGNOSTIC_MAX_CHARS);

    expect(truncateDiagnosticText(exact)).toBe(exact);
  });

  it("truncates one character past the limit, reporting the original length", () => {
    const over = "x".repeat(DATA_APP_DIAGNOSTIC_MAX_CHARS + 1);

    expect(truncateDiagnosticText(over)).toBe(
      `${"x".repeat(DATA_APP_DIAGNOSTIC_MAX_CHARS)}… (truncated, ${over.length} chars)`,
    );
  });

  it("honours a caller's own limit", () => {
    expect(truncateDiagnosticText("abcdef", 3)).toBe(
      "abc… (truncated, 6 chars)",
    );
  });

  it("is not idempotent, so callers must truncate once", () => {
    const once = truncateDiagnosticText("abcdef", 3);

    expect(truncateDiagnosticText(once, 3)).not.toBe(once);
  });
});
