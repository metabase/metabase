import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import {
  FIXTURE_INPUTS,
  ONE_BY_ONE_COUNT,
  TIME_SERIES,
} from "../__fixtures__/inputs";
import { getContractViolations } from "../contract";
import type { VizInput } from "../types";

import { legacyDefaultHeuristic } from "./index";

const COUNT = { type: "operator", operator: "count", args: [] } as const;

const ordersQuery = (breakouts: { name: string; unit?: string }[]) =>
  Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [COUNT],
        breakouts: breakouts.map((breakout) => ({
          type: "column",
          sourceName: "ORDERS",
          ...breakout,
        })),
      },
    ],
  });

describe("legacy-default heuristic", () => {
  it("satisfies the contract", () => {
    expect(
      getContractViolations(
        legacyDefaultHeuristic,
        Object.values(FIXTURE_INPUTS),
      ),
    ).toEqual([]);
  });

  it("uses Lib.defaultDisplay when there is a query", () => {
    const input: VizInput = {
      ...TIME_SERIES,
      query: ordersQuery([{ name: "CREATED_AT", unit: "month" }]),
      hint: { display: "bar" },
    };
    expect(legacyDefaultHeuristic.resolve(input)).toEqual({ display: "line" });
  });

  it("switches a 1×1 result to scalar even with a table query", () => {
    const input: VizInput = { ...ONE_BY_ONE_COUNT, query: ordersQuery([]) };
    expect(legacyDefaultHeuristic.resolve(input).display).toBe("scalar");
  });

  it("uses the hint, then a table, without a query", () => {
    expect(
      legacyDefaultHeuristic.resolve({
        ...TIME_SERIES,
        hint: { display: "area" },
      }),
    ).toEqual({ display: "area", settings: undefined });
    expect(legacyDefaultHeuristic.resolve(TIME_SERIES)).toEqual({
      display: "table",
    });
  });

  it("respects allowed: hint first, then the first allowed display", () => {
    expect(
      legacyDefaultHeuristic.resolve({
        ...TIME_SERIES,
        query: ordersQuery([{ name: "CREATED_AT", unit: "month" }]),
        hint: { display: "area" },
        allowed: ["bar", "area"],
      }).display,
    ).toBe("area");
    expect(
      legacyDefaultHeuristic.resolve({
        ...TIME_SERIES,
        query: ordersQuery([{ name: "CREATED_AT", unit: "month" }]),
        allowed: ["bar", "area"],
      }).display,
    ).toBe("bar");
  });
});
