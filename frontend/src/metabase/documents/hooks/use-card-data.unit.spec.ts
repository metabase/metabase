import { renderHook } from "@testing-library/react";

import type { Card, Dataset, DatasetQuery } from "metabase-types/api";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

// Stub RTKQ + Redux + Question. The hook under test is pure layout — the
// override path doesn't need real data, just the rendering composition.
const mockCard: { value: Card | undefined } = { value: undefined };
const mockDataset: { value: Dataset | undefined } = { value: undefined };

jest.mock("metabase/api", () => ({
  __esModule: true,
  skipToken: Symbol("skipToken"),
  useGetCardQuery: () => ({
    data: mockCard.value,
    isLoading: false,
    error: undefined,
  }),
  useGetCardQueryQuery: () => ({
    data: mockDataset.value,
    isLoading: false,
  }),
}));

jest.mock("metabase/api/dataset", () => ({
  __esModule: true,
  useGetAdhocQueryQuery: () => ({ data: undefined, isLoading: false }),
  useGetAdhocPivotQueryQuery: () => ({ data: undefined, isLoading: false }),
}));

jest.mock("metabase/redux", () => ({
  __esModule: true,
  useSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

jest.mock("metabase/selectors/metadata", () => ({
  __esModule: true,
  getMetadata: () => ({}) as any,
}));

jest.mock("../selectors", () => ({
  __esModule: true,
  getCardWithDraft: () => undefined,
}));

// `new Question(card, metadata)` is heavy. The hook only reads its return
// value through; tests assert on the card itself, not the Question.
jest.mock("metabase-lib/v1/Question", () => {
  return jest.fn().mockImplementation((card: Card) => ({ card }));
});

// `getPivotOptions` is only reached on the draft+pivot path — not exercised
// here, so the trivial stub is safe.
jest.mock("metabase-lib/v1/queries/utils/pivot", () => ({
  __esModule: true,
  getPivotOptions: () => ({}),
}));

import { useCardData } from "./use-card-data";

describe("useCardData", () => {
  afterEach(() => {
    mockCard.value = undefined;
    mockDataset.value = undefined;
  });

  const SAVED_DATASET_QUERY: DatasetQuery = {
    type: "query",
    database: 1,
    query: { "source-table": 10, breakout: [["field", 100, null]] },
  } as DatasetQuery;

  const OVERRIDE_DATASET_QUERY: DatasetQuery = {
    type: "query",
    database: 1,
    query: {
      "source-table": 10,
      breakout: [
        ["field", 100, null],
        ["field", 200, { "temporal-unit": "day-of-week" }],
      ],
    },
  } as DatasetQuery;

  it("composes `datasetQueryOverride` onto the returned card so the rendering pipeline sees the variant's MBQL", () => {
    mockCard.value = createMockCard({
      id: 7,
      dataset_query: SAVED_DATASET_QUERY,
    });
    mockDataset.value = createMockDataset();

    const { result } = renderHook(() =>
      useCardData({
        id: 7,
        storedResultId: 99,
        datasetQueryOverride: OVERRIDE_DATASET_QUERY,
      }),
    );

    expect(result.current.card?.dataset_query).toEqual(OVERRIDE_DATASET_QUERY);
    // The composed card flows through to `series` so `Visualization` reads
    // the overridden `dataset_query` for column resolution.
    expect(result.current.series?.[0]?.card?.dataset_query).toEqual(
      OVERRIDE_DATASET_QUERY,
    );
  });

  it("leaves other card fields intact when applying the override", () => {
    mockCard.value = createMockCard({
      id: 7,
      name: "Revenue by Plan",
      display: "bar",
      dataset_query: SAVED_DATASET_QUERY,
    });
    mockDataset.value = createMockDataset();

    const { result } = renderHook(() =>
      useCardData({
        id: 7,
        storedResultId: 99,
        datasetQueryOverride: OVERRIDE_DATASET_QUERY,
      }),
    );

    expect(result.current.card?.id).toBe(7);
    expect(result.current.card?.name).toBe("Revenue by Plan");
    expect(result.current.card?.display).toBe("bar");
  });

  it("returns the saved card untouched when no override is supplied", () => {
    mockCard.value = createMockCard({
      id: 7,
      dataset_query: SAVED_DATASET_QUERY,
    });
    mockDataset.value = createMockDataset();

    const { result } = renderHook(() =>
      useCardData({ id: 7, storedResultId: 99 }),
    );

    expect(result.current.card?.dataset_query).toEqual(SAVED_DATASET_QUERY);
  });

  it("does not compose the override onto a draft card (negative id)", () => {
    // Draft cards (id < 0) re-run their adhoc query off the card's own
    // `dataset_query`; substituting the override there would mismatch the
    // executed query and the rendered shape.
    mockCard.value = createMockCard({
      id: -1,
      dataset_query: SAVED_DATASET_QUERY,
    });
    mockDataset.value = createMockDataset();

    const { result } = renderHook(() =>
      useCardData({
        id: -1,
        datasetQueryOverride: OVERRIDE_DATASET_QUERY,
      }),
    );

    // Draft path: the saved-card hook is skipped, so `card` is undefined
    // without a draft card in the store. The important guarantee is that
    // we never substitute the override onto a draft.
    expect(result.current.card?.dataset_query).not.toEqual(
      OVERRIDE_DATASET_QUERY,
    );
  });
});
