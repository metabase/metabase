import fetchMock from "fetch-mock";

import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type { GoalData } from "metabase/viz-core";
import type { GoalValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
} from "metabase-types/api/mocks";

import { useResolvedGoalData } from "./use-resolved-goal-data";

const DATA: GoalData = {
  cols: [createMockColumn({ name: "count" })],
  rows: [[50]],
};

const GOAL_REF: GoalValue = { type: "card", id: 9, column: "goal" };

interface SetupOpts {
  data?: GoalData;
  goalValues: (GoalValue | null)[];
}

function setup({ data = DATA, goalValues }: SetupOpts) {
  return renderHookWithProviders(
    ({ goalValues }: { goalValues: (GoalValue | null)[] }) =>
      useResolvedGoalData(data, goalValues),
    { initialProps: { goalValues } },
  );
}

describe("useResolvedGoalData", () => {
  it("resolves static values, self-column names and empty bounds without fetching", () => {
    const { result } = setup({ goalValues: [0, 100, "count", null] });

    expect(result.current).toEqual({
      status: "resolved",
      data: DATA,
      results: [{ value: 0 }, { value: 100 }, { value: 50 }, { value: null }],
    });
    expect(getGoalValuesCalls()).toHaveLength(0);
  });

  it("answers references the data can't by fetching the values of their sources", async () => {
    setupGoalValuesEndpoint(
      createMockReferencedEntitiesResults({ column: "goal", value: 250 }),
    );

    const { result } = setup({ goalValues: [0, GOAL_REF] });
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: {
          rows: DATA.rows,
          referenced_entities: { card: { 9: { data: { rows: [[250]] } } } },
        },
        results: [{ value: 0 }, { value: 250 }],
      }),
    );
    expect(await getLastRequestBody()).toEqual({
      sources: [{ type: "card", id: 9 }],
    });
  });

  it("reports a reference the data already reports as failed without fetching", () => {
    const data: GoalData = {
      ...DATA,
      referenced_entities: createMockFailedReferencedEntitiesResults({
        error: "boom",
      }),
    };

    const { result } = setup({ data, goalValues: [0, GOAL_REF] });

    expect(result.current).toMatchObject({
      status: "resolved",
      results: [
        { value: 0 },
        { value: null, error: { reason: "query-failed", message: "boom" } },
      ],
    });
    expect(getGoalValuesCalls()).toHaveLength(0);
  });

  it("reports a self-column name that matches no column without fetching", () => {
    const { result } = setup({ goalValues: ["missing", 100] });

    expect(result.current).toMatchObject({
      status: "resolved",
      results: [
        { value: null, error: { reason: "column-not-found" } },
        { value: 100 },
      ],
    });
    expect(getGoalValuesCalls()).toHaveLength(0);
  });

  it("reports fresh values that still lack the referenced column", async () => {
    setupGoalValuesEndpoint(
      createMockReferencedEntitiesResults({ column: "other", value: 1 }),
    );

    const { result } = setup({ goalValues: [0, GOAL_REF] });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        results: [{ value: 0 }, { error: { reason: "column-not-found" } }],
      }),
    );
  });

  it("reports the references when fetching the values fails", async () => {
    setupGoalValuesEndpoint(() => new Response(null, { status: 500 }));

    const { result } = setup({ goalValues: [0, GOAL_REF] });

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

  it("reports a reference the fresh values report as failed", async () => {
    setupGoalValuesEndpoint(
      createMockFailedReferencedEntitiesResults({ error: "boom" }),
    );

    const { result } = setup({ goalValues: [0, GOAL_REF] });

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

  it("keeps resolving while a retargeted reference's values are in flight", async () => {
    setupGoalValuesEndpoint(
      createMockReferencedEntitiesResults({ id: 9, value: 250 }),
      { body: { sources: [{ type: "card", id: 9 }] }, name: "card-9-values" },
    );
    setupGoalValuesEndpoint(
      createMockReferencedEntitiesResults({ id: 10, value: 500 }),
      { body: { sources: [{ type: "card", id: 10 }] }, name: "card-10-values" },
    );

    const { result, rerender } = setup({ goalValues: [GOAL_REF] });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        results: [{ value: 250 }],
      }),
    );

    rerender({ goalValues: [{ type: "card", id: 10, column: "goal" }] });

    // the previous reference's values must not read as a failure for this one
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        results: [{ value: 500 }],
      }),
    );
  });

  it("keeps answers the data already has when merging in fresh ones", async () => {
    const data: GoalData = {
      ...DATA,
      referenced_entities: createMockReferencedEntitiesResults({
        type: "measure",
        id: 4,
        column: "sum",
        value: 10,
      }),
    };
    setupGoalValuesEndpoint(
      createMockReferencedEntitiesResults({ column: "goal", value: 250 }),
    );

    const { result } = setup({
      data,
      goalValues: [{ type: "measure", id: 4, column: "sum" }, GOAL_REF],
    });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        data: {
          referenced_entities: {
            measure: { 4: { data: { rows: [[10]] } } },
            card: { 9: { data: { rows: [[250]] } } },
          },
        },
        results: [{ value: 10 }, { value: 250 }],
      }),
    );
    expect(await getLastRequestBody()).toEqual({
      sources: [{ type: "card", id: 9 }],
    });
  });
});

function getGoalValuesCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}

async function getLastRequestBody(): Promise<unknown> {
  const call = fetchMock.callHistory.lastCall("path:/api/dynamic-goal/values");
  return checkNotNull(call?.request).json();
}
