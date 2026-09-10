import type * as DefaultViz from "metabase/visualizations/lib/default-viz";
import {
  chooseDefaultViz,
  chooseDefaultVizTwoStage,
} from "metabase/visualizations/lib/default-viz";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import {
  FIXTURE_INPUTS,
  ONE_BY_ONE_COUNT,
  TIME_SERIES,
} from "../__fixtures__/inputs";
import { getContractViolations } from "../contract";
import { resolveLegacyDefault } from "../shared";
import type { VizInput } from "../types";

import { defaultVizV1Heuristic } from "./index";

jest.mock("metabase/visualizations/lib/default-viz", () => {
  const actual = jest.requireActual<typeof DefaultViz>(
    "metabase/visualizations/lib/default-viz",
  );
  return {
    ...actual,
    chooseDefaultViz: jest.fn(actual.chooseDefaultViz),
    chooseDefaultVizTwoStage: jest.fn(actual.chooseDefaultVizTwoStage),
  };
});

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

const MONTHLY_QUERY_INPUT: VizInput = {
  ...TIME_SERIES,
  query: ordersQuery([{ name: "CREATED_AT", unit: "month" }]),
};

describe("default-viz-v1 heuristic", () => {
  beforeEach(() => {
    jest.mocked(chooseDefaultViz).mockClear();
    jest.mocked(chooseDefaultVizTwoStage).mockClear();
  });

  it("satisfies the contract", () => {
    expect(
      getContractViolations(
        defaultVizV1Heuristic,
        Object.values(FIXTURE_INPUTS),
      ),
    ).toEqual([]);
  });

  it("uses the two-stage chooser when rows are present", () => {
    const decision = defaultVizV1Heuristic.resolve(MONTHLY_QUERY_INPUT);

    expect(chooseDefaultVizTwoStage).toHaveBeenCalledTimes(1);
    expect(chooseDefaultViz).not.toHaveBeenCalled();
    expect(decision.display).toBe("line");
    expect(decision.trace).toEqual(
      expect.objectContaining({
        timings: expect.objectContaining({ rowsScanned: 3 }),
      }),
    );
  });

  it("uses the single-stage chooser without rows", () => {
    const decision = defaultVizV1Heuristic.resolve({
      ...MONTHLY_QUERY_INPUT,
      rows: undefined,
    });

    expect(chooseDefaultViz).toHaveBeenCalledTimes(1);
    expect(chooseDefaultVizTwoStage).not.toHaveBeenCalled();
    expect(decision.display).toBe("line");
    expect(decision.trace).toEqual(expect.objectContaining({ stage: 1 }));
  });

  it("resolves a 1×1 count to scalar", () => {
    expect(
      defaultVizV1Heuristic.resolve({
        ...ONE_BY_ONE_COUNT,
        query: ordersQuery([]),
      }).display,
    ).toBe("scalar");
  });

  it("falls back to the legacy default without a query", () => {
    expect(defaultVizV1Heuristic.resolve(TIME_SERIES)).toEqual(
      resolveLegacyDefault(TIME_SERIES),
    );
    expect(chooseDefaultViz).not.toHaveBeenCalled();
    expect(chooseDefaultVizTwoStage).not.toHaveBeenCalled();
  });

  it("falls back to the legacy default when the chooser throws", () => {
    jest.mocked(chooseDefaultVizTwoStage).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const input: VizInput = {
      ...MONTHLY_QUERY_INPUT,
      hint: { display: "area" },
    };

    expect(defaultVizV1Heuristic.resolve(input)).toEqual(
      resolveLegacyDefault(input),
    );
  });

  it("maps to allowed through the alternatives, then the hint", () => {
    const alternatives = defaultVizV1Heuristic.resolve(MONTHLY_QUERY_INPUT);
    expect(alternatives.display).toBe("line");

    const constrained = defaultVizV1Heuristic.resolve({
      ...MONTHLY_QUERY_INPUT,
      hint: { display: "scatter" },
      allowed: ["scatter", "area"],
    });
    expect(["scatter", "area"]).toContain(constrained.display);
  });
});
