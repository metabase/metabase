import fetchMock from "fetch-mock";

import { setupGoalSourceResultsEndpoint } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { GoalSourceResults, GoalValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockFailedGoalSourceResults,
  createMockGoalSourceResult,
  createMockGoalSourceResults,
} from "metabase-types/api/mocks";

import {
  useResolvedGoalValue,
  useResolvedGoalValues,
} from "./use-resolved-goal-values";

const DATA = createMockDatasetData({
  cols: [createMockColumn({ name: "count" })],
  rows: [[50]],
});

const GOAL_REF: GoalValue = { type: "card", id: 9, column: "goal" };

type SetupOpts = {
  values: (GoalValue | null)[];
};

function setup({ values }: SetupOpts) {
  return renderHookWithProviders(
    ({ goalValues }: { goalValues: (GoalValue | null)[] }) =>
      useResolvedGoalValues(DATA, goalValues),
    { initialProps: { goalValues: values } },
  );
}

describe("useResolvedGoalValues", () => {
  it("resolves static values, self-column names and empty bounds without a request", () => {
    const { result } = setup({ values: [0, 100, "count", null] });

    expect(result.current).toEqual({
      status: "resolved",
      sourceResults: {},
      results: [{ value: 0 }, { value: 100 }, { value: 50 }, { value: null }],
    });
    expect(getGoalSourceCalls()).toHaveLength(0);
  });

  it("resolves entity references from one request for all of their sources", async () => {
    setupGoalSourceResultsEndpoint({
      card: { 9: createMockGoalSourceResult({ column: "goal", value: 250 }) },
      measure: { 4: createMockGoalSourceResult({ column: "sum", value: 10 }) },
    });

    const { result } = setup({
      values: [
        0,
        { type: "measure", id: 4, column: "sum" },
        GOAL_REF,
        { type: "card", id: 9, column: "goal" },
      ],
    });
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        results: [{ value: 0 }, { value: 10 }, { value: 250 }, { value: 250 }],
      }),
    );
    expect(await getGoalSourceBodies()).toEqual([
      {
        sources: [
          { type: "card", id: 9 },
          { type: "measure", id: 4 },
        ],
      },
    ]);
  });

  it("reports a source the backend reports as failed", async () => {
    setupGoalSourceResultsEndpoint(
      createMockFailedGoalSourceResults({ error: "boom" }),
    );

    const { result } = setup({ values: [0, GOAL_REF] });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        results: [
          { value: 0 },
          { value: null, error: { reason: "query-failed", message: "boom" } },
        ],
      }),
    );
  });

  it("reports every entity reference when the request fails", async () => {
    setupGoalSourceResultsEndpoint(500);

    const { result } = setup({ values: [0, GOAL_REF] });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        results: [
          { value: 0 },
          { value: null, error: { reason: "query-failed" } },
        ],
      }),
    );
  });

  it("reports a source the backend did not run", async () => {
    setupGoalSourceResultsEndpoint({});

    const { result } = setup({ values: [GOAL_REF] });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        results: [{ value: null, error: { reason: "query-failed" } }],
      }),
    );
  });

  it("reports a source result without the referenced column", async () => {
    setupGoalSourceResultsEndpoint(
      createMockGoalSourceResults({ column: "other", value: 1 }),
    );

    const { result } = setup({ values: [GOAL_REF] });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        results: [{ value: null, error: { reason: "column-not-found" } }],
      }),
    );
  });

  it("keeps resolving while the results of a new source are in flight", async () => {
    setupGoalSourceResultsEndpoint((call) => {
      const { body } = call.options;
      const isFirstSource = typeof body === "string" && body.includes('"id":9');
      return createMockGoalSourceResults({
        id: isFirstSource ? 9 : 10,
        column: "goal",
        value: isFirstSource ? 250 : 500,
      });
    });

    const { result, rerender } = setup({ values: [GOAL_REF] });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        results: [{ value: 250 }],
      }),
    );

    rerender({ goalValues: [{ type: "card", id: 10, column: "goal" }] });

    // the results of the previous source must not read as a failure of this one
    expect(result.current).toEqual({ status: "resolving" });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        results: [{ value: 500 }],
      }),
    );
  });
});

describe("useResolvedGoalValue", () => {
  it("is loading until the results of an entity reference load", async () => {
    const sourceResults: GoalSourceResults = createMockGoalSourceResults({
      column: "goal",
      value: 250,
    });
    setupGoalSourceResultsEndpoint(sourceResults);

    const { result } = renderHookWithProviders(
      () =>
        useResolvedGoalValue({
          data: DATA,
          sources: [{ type: "card", id: 9 }],
          value: GOAL_REF,
        }),
      {},
    );
    expect(result.current).toEqual({ value: null, isLoading: true });

    await waitFor(() => expect(result.current).toEqual({ value: 250 }));
  });

  it("resolves a self-column name while the results of the other sources load", () => {
    setupGoalSourceResultsEndpoint(createMockGoalSourceResults());

    const { result } = renderHookWithProviders(
      () =>
        useResolvedGoalValue({
          data: DATA,
          sources: [{ type: "card", id: 9 }],
          value: "count",
        }),
      {},
    );

    expect(result.current).toEqual({ value: 50 });
  });
});

function getGoalSourceCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}

function getGoalSourceBodies(): Promise<unknown[]> {
  return Promise.all(
    getGoalSourceCalls().map((call): Promise<unknown> => {
      return call.request?.json() ?? Promise.resolve(undefined);
    }),
  );
}
