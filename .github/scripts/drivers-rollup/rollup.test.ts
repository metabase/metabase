import { describe, expect, test } from "bun:test";

import type { ConfigEntry } from "./config";
import { type CheckRun, computeRollup } from "./rollup";

const completed = (name: string, conclusion: string): CheckRun => ({
  name,
  status: "completed",
  conclusion,
});
const running = (name: string): CheckRun => ({ name, status: "in_progress", conclusion: null });

const CONFIG: ConfigEntry[] = [
  { id: "drivers-tests-databricks-ee", status: "skip" },
  { id: "drivers-tests-snowflake-ee", status: "info" },
  { id: "drivers-tests-bigquery-cloud-sdk-ee", status: "info" },
];

describe("computeRollup", () => {
  test("success when all required checks pass (info/skip ignored)", () => {
    const r = computeRollup(
      [
        completed("driver-tests / drivers-tests-h2", "success"),
        completed("driver-tests / drivers-tests-postgres (Postgres 14.x Driver Tests)", "success"),
        completed("driver-tests / drivers-tests-snowflake-ee (Driver Tests)", "failure"), // info → ignored
        completed("driver-tests / drivers-tests-databricks-ee", "failure"), // skip → ignored
      ],
      CONFIG,
    );
    expect(r.state).toBe("completed");
    expect(r.conclusion).toBe("success");
    expect(r.counts).toMatchObject({ required: 2, passing: 2, failing: 0, info: 1, skip: 1 });
  });

  test("pending while any required check is still running", () => {
    const r = computeRollup(
      [
        completed("driver-tests / drivers-tests-h2", "success"),
        running("driver-tests / drivers-tests-postgres (Postgres Latest Driver Tests)"),
      ],
      CONFIG,
    );
    expect(r.state).toBe("in_progress");
    expect(r.conclusion).toBeNull();
    expect(r.counts).toMatchObject({ required: 2, passing: 1, pending: 1 });
  });

  test("failure when any required check fails, even if others still pending", () => {
    const r = computeRollup(
      [
        completed("driver-tests / drivers-tests-h2", "failure"),
        running("driver-tests / drivers-tests-postgres (x)"),
      ],
      CONFIG,
    );
    expect(r.state).toBe("completed");
    expect(r.conclusion).toBe("failure");
    expect(r.counts).toMatchObject({ failing: 1 });
  });

  test("missing-from-config check is treated as required", () => {
    const r = computeRollup([completed("driver-tests / drivers-tests-oracle (Oracle 18.4)", "failure")], CONFIG);
    expect(r.conclusion).toBe("failure");
    expect(r.counts.required).toBe(1);
  });

  test("skipped and neutral conclusions count as passing", () => {
    const r = computeRollup(
      [
        completed("driver-tests / drivers-tests-h2", "skipped"),
        completed("driver-tests / drivers-tests-sqlite-ee", "neutral"),
      ],
      CONFIG,
    );
    expect(r.conclusion).toBe("success");
    expect(r.counts).toMatchObject({ required: 2, passing: 2 });
  });

  test("success with zero required checks (everything info/skip)", () => {
    const r = computeRollup(
      [
        completed("driver-tests / drivers-tests-snowflake-ee (Driver Tests)", "failure"),
        completed("driver-tests / drivers-tests-databricks-ee", "failure"),
      ],
      CONFIG,
    );
    expect(r.state).toBe("completed");
    expect(r.conclusion).toBe("success");
    expect(r.counts.required).toBe(0);
  });

  test("ignores non-driver checks and its own aggregate", () => {
    const r = computeRollup(
      [
        completed("frontend / unit", "failure"),
        completed("driver-tests / determine-driver-skips", "success"),
        completed("drivers-tests-result", "failure"), // self, never counts
        completed("driver-tests / drivers-tests-h2", "success"),
      ],
      CONFIG,
    );
    expect(r.conclusion).toBe("success");
    expect(r.counts).toMatchObject({ required: 1, nonDriver: 3 });
  });

  test("mongo vs mongo-ssl are scored independently", () => {
    const config: ConfigEntry[] = [{ id: "drivers-tests-mongo", status: "info" }];
    const r = computeRollup(
      [
        completed("driver-tests / drivers-tests-mongo (MongoDB 6.0)", "failure"), // info → ignored
        completed("driver-tests / drivers-tests-mongo-ssl (MongoDB 6.0)", "failure"), // required → fails
      ],
      config,
    );
    expect(r.conclusion).toBe("failure");
    expect(r.counts).toMatchObject({ required: 1, failing: 1, info: 1 });
  });
});
