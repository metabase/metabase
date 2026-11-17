import fetchMock from "fetch-mock";

import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { DatasetData, GoalValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
} from "metabase-types/api/mocks";

import { useResolvedGoalData } from "./use-resolved-goal-data";

const DATA = createMockDatasetData({
  cols: [createMockColumn({ name: "count" })],
  rows: [[50]],
});

const GOAL_REF: GoalValue = { type: "card", id: 9, column: "goal" };

function setup(data: DatasetData, goalValues: (GoalValue | null)[]) {
  return renderHookWithProviders(
    () => useResolvedGoalData(data, goalValues),
    {},
  );
}

describe("useResolvedGoalData", () => {
  it("resolves static values, self-column names and empty bounds without fetching", () => {
    const { result } = setup(DATA, [0, 100, "count", null]);

    expect(result.current).toEqual({
      status: "resolved",
      data: DATA,
      results: [{ value: 0 }, { value: 100 }, { value: 50 }, { value: null }],
    });
    expect(
      fetchMock.callHistory.calls("path:/api/dynamic-goal/values"),
    ).toHaveLength(0);
  });

  it("answers references the dataset can't by fetching their goal values", async () => {
    setupGoalValuesEndpoint(createReferencedEntitiesAnswer(250));

    const { result } = setup(DATA, [0, GOAL_REF]);
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: {
          rows: DATA.rows,
          referenced_entities: { card: { 9: { data: { rows: [[250]] } } } },
        },
      }),
    );

    const call = fetchMock.callHistory.lastCall(
      "path:/api/dynamic-goal/values",
    );
    expect(await call?.request?.json()).toEqual({
      sources: [{ type: "card", id: 9 }],
    });
  });

  it("reports a reference the dataset already reports as failed without fetching", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: createMockFailedReferencedEntitiesResults({
        error: "boom",
      }),
    });

    const { result } = setup(data, [0, GOAL_REF]);

    expect(result.current).toMatchObject({
      status: "resolved",
      results: [
        { value: 0 },
        { value: null, error: { reason: "query-failed", message: "boom" } },
      ],
    });
    expect(
      fetchMock.callHistory.calls("path:/api/dynamic-goal/values"),
    ).toHaveLength(0);
  });

  it("reports a self-column name that matches no column without fetching", () => {
    const { result } = setup(DATA, ["missing", 100]);

    expect(result.current).toMatchObject({
      status: "resolved",
      results: [
        { value: null, error: { reason: "column-not-found" } },
        { value: 100 },
      ],
    });
    expect(
      fetchMock.callHistory.calls("path:/api/dynamic-goal/values"),
    ).toHaveLength(0);
  });

  it("reports a fresh answer that still lacks the referenced column", async () => {
    setupGoalValuesEndpoint(createReferencedEntitiesAnswer(1, "other"));

    const { result } = setup(DATA, [0, GOAL_REF]);

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        results: [{ value: 0 }, { error: { reason: "column-not-found" } }],
      }),
    );
  });

  it("reports the references when the goal values request fails", async () => {
    setupGoalValuesEndpoint(500);

    const { result } = setup(DATA, [0, GOAL_REF]);

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: DATA,
        results: [
          { value: 0 },
          {
            error: {
              reason: "query-failed",
              message: "Couldn't load this value",
            },
          },
        ],
      }),
    );
  });

  it("reports a reference the fresh answer reports as failed", async () => {
    setupGoalValuesEndpoint(
      createMockFailedReferencedEntitiesResults({ error: "boom" }),
    );

    const { result } = setup(DATA, [0, GOAL_REF]);

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        results: [
          { value: 0 },
          { error: { reason: "query-failed", message: "boom" } },
        ],
      }),
    );
  });

  it("keeps resolving while a retargeted reference's answer is in flight", async () => {
    setupGoalValuesEndpoint({
      card: {
        ...createMockReferencedEntitiesResults({ column: "goal", value: 250 })
          .card,
        ...createMockReferencedEntitiesResults({
          id: 10,
          column: "goal",
          value: 500,
        }).card,
      },
    });

    const { result, rerender } = renderHookWithProviders(
      ({ goalValues }: { goalValues: GoalValue[] }) =>
        useResolvedGoalData(DATA, goalValues),
      { initialProps: { goalValues: [GOAL_REF] } },
    );

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: {
          referenced_entities: { card: { 9: { data: { rows: [[250]] } } } },
        },
      }),
    );

    rerender({ goalValues: [{ type: "card", id: 10, column: "goal" }] });

    // the previous question's answer must not read as a failure for this one
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: {
          referenced_entities: { card: { 10: { data: { rows: [[500]] } } } },
        },
      }),
    );
  });

  it("keeps answers the dataset already has when merging in fresh ones", async () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: createMockReferencedEntitiesResults({
        type: "measure",
        id: 4,
        column: "sum",
        value: 10,
      }),
    });
    setupGoalValuesEndpoint(createReferencedEntitiesAnswer(250));

    const { result } = setup(data, [
      { type: "measure", id: 4, column: "sum" },
      GOAL_REF,
    ]);

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: {
          referenced_entities: {
            measure: { 4: { data: { rows: [[10]] } } },
            card: { 9: { data: { rows: [[250]] } } },
          },
        },
      }),
    );
  });
});

function createReferencedEntitiesAnswer(goal: number, column = "goal") {
  return createMockReferencedEntitiesResults({ column, value: goal });
}
