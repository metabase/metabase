import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { DatasetData, GoalSegment } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { useResolvedGoalSegments } from "./use-resolved-goal-segments";

const DATASET_QUERY = createMockStructuredDatasetQuery();

const DATA = createMockDatasetData({
  cols: [createMockColumn({ name: "count" })],
  rows: [[50]],
});

const STATIC_SEGMENTS: GoalSegment[] = [
  { min: 0, max: 100, color: "red", label: "" },
];

const DYNAMIC_SEGMENTS: GoalSegment[] = [
  {
    min: 0,
    max: { type: "card", id: 9, column: "goal" },
    color: "red",
    label: "",
  },
];

function setup(data: DatasetData, segments: GoalSegment[]) {
  return renderHookWithProviders(
    () => useResolvedGoalSegments(DATASET_QUERY, data, segments),
    {},
  );
}

describe("useResolvedGoalSegments", () => {
  it("resolves answered segments without fetching", () => {
    const { result } = setup(DATA, STATIC_SEGMENTS);

    expect(result.current).toEqual({
      status: "resolved",
      segments: [{ min: 0, max: 100, color: "red", label: "" }],
    });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("answers references the dataset can't by re-running the query with them attached", async () => {
    setupCardDataset({
      dataset: {
        data: createMockDatasetData({
          referenced_entities: {
            card: {
              9: {
                status: "completed",
                data: {
                  cols: [createMockColumn({ name: "goal" })],
                  rows: [[250]],
                },
              },
            },
          },
        }),
      },
    });

    const { result } = setup(DATA, DYNAMIC_SEGMENTS);
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "resolved",
        segments: [{ min: 0, max: 250, color: "red", label: "" }],
      }),
    );

    const call = fetchMock.callHistory.lastCall("path:/api/dataset");
    expect(await call?.request?.json()).toMatchObject({
      referenced_entities: [{ type: "card", id: 9 }],
    });
  });

  it("fails without fetching when the dataset already reports a failed reference", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        card: { 9: { status: "failed", error: "boom" } },
      },
    });

    const { result } = setup(data, DYNAMIC_SEGMENTS);

    expect(result.current).toEqual({ status: "failed" });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("fails when the fresh answer still lacks the referenced column", async () => {
    setupCardDataset({
      dataset: {
        data: createMockDatasetData({
          referenced_entities: {
            card: {
              9: {
                status: "completed",
                data: {
                  cols: [createMockColumn({ name: "other" })],
                  rows: [[1]],
                },
              },
            },
          },
        }),
      },
    });

    const { result } = setup(DATA, DYNAMIC_SEGMENTS);

    await waitFor(() => expect(result.current).toEqual({ status: "failed" }));
  });

  it("fails when the resolving query fails", async () => {
    setupCardDataset({ status: 500 });

    const { result } = setup(DATA, DYNAMIC_SEGMENTS);

    await waitFor(() => expect(result.current).toEqual({ status: "failed" }));
  });

  it("fails when the fresh answer reports a failed reference", async () => {
    setupCardDataset({
      dataset: {
        data: createMockDatasetData({
          referenced_entities: {
            card: { 9: { status: "failed", error: "boom" } },
          },
        }),
      },
    });

    const { result } = setup(DATA, DYNAMIC_SEGMENTS);

    await waitFor(() => expect(result.current).toEqual({ status: "failed" }));
  });

  it("keeps resolving while a retargeted reference's answer is in flight", async () => {
    fetchMock.post("path:/api/dataset", async (call) => {
      const body = await fetchMock.callHistory
        .lastCall(call.url)
        ?.request?.json();
      const [entity] = body.referenced_entities;
      return {
        data: createMockDatasetData({
          referenced_entities: {
            card: {
              [entity.id]: {
                status: "completed",
                data: {
                  cols: [createMockColumn({ name: "goal" })],
                  rows: [[entity.id === 9 ? 250 : 500]],
                },
              },
            },
          },
        }),
      };
    });

    const { result, rerender } = renderHookWithProviders(
      ({ segments }: { segments: GoalSegment[] }) =>
        useResolvedGoalSegments(DATASET_QUERY, DATA, segments),
      { initialProps: { segments: DYNAMIC_SEGMENTS } },
    );

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "resolved",
        segments: [{ min: 0, max: 250, color: "red", label: "" }],
      }),
    );

    rerender({
      segments: [
        {
          min: 0,
          max: { type: "card", id: 10, column: "goal" },
          color: "red",
          label: "",
        },
      ],
    });

    // the previous question's answer must not read as a failure for this one
    expect(result.current).toEqual({ status: "resolving" });

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "resolved",
        segments: [{ min: 0, max: 500, color: "red", label: "" }],
      }),
    );
  });

  it("keeps answers the dataset already has when merging in fresh ones", async () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_entities: {
        measure: {
          4: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "sum" })], rows: [[10]] },
          },
        },
      },
    });
    const segments: GoalSegment[] = [
      {
        min: { type: "measure", id: 4, column: "sum" },
        max: { type: "card", id: 9, column: "goal" },
        color: "red",
        label: "",
      },
    ];
    setupCardDataset({
      dataset: {
        data: createMockDatasetData({
          referenced_entities: {
            card: {
              9: {
                status: "completed",
                data: {
                  cols: [createMockColumn({ name: "goal" })],
                  rows: [[250]],
                },
              },
            },
          },
        }),
      },
    });

    const { result } = setup(data, segments);

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "resolved",
        segments: [{ min: 10, max: 250, color: "red", label: "" }],
      }),
    );
  });
});
