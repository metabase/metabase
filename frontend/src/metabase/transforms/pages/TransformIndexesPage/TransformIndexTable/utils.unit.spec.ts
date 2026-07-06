import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { TableIndexRequestStatus } from "metabase-types/api";

import { formatStatus, isPendingStatus } from "./utils";

describe("formatStatus", () => {
  it.each<[TableIndexRequestStatus, string]>([
    ["create-pending", "Pending"],
    ["update-pending", "Pending"],
    ["verify-pending", "Pending"],
    ["delete-pending", "Removing"],
    ["running", "Running"],
    ["succeeded", "Succeeded"],
    ["failed", "Failed"],
  ])("formats %s as %s", (status, expected) => {
    expect(formatStatus(status)).toBe(expected);
  });

  // formatStatus uses ts-pattern's .exhaustive(); an unhandled status throws.
  it("does not throw on verify-pending", () => {
    expect(() => formatStatus("verify-pending")).not.toThrow();
  });

  it("returns the empty placeholder for an undefined status", () => {
    expect(formatStatus(undefined)).toBe(EMPTY_CELL_PLACEHOLDER);
  });
});

describe("isPendingStatus", () => {
  it.each<TableIndexRequestStatus>([
    "create-pending",
    "update-pending",
    "delete-pending",
    "verify-pending",
  ])("returns true for %s", (status) => {
    expect(isPendingStatus(status)).toBe(true);
  });

  it.each<TableIndexRequestStatus>(["running", "succeeded", "failed"])(
    "returns false for %s",
    (status) => {
      expect(isPendingStatus(status)).toBe(false);
    },
  );

  it("returns false for an undefined status", () => {
    expect(isPendingStatus(undefined)).toBe(false);
  });
});
