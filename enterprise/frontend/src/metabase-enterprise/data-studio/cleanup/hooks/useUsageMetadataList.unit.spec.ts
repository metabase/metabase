import { act, renderHook, waitFor } from "@testing-library/react";

import type { UsageMetadataPage } from "metabase-types/api";

import {
  appendUniqueItems,
  useUsageMetadataPages,
} from "./useUsageMetadataList";

type TestItem = { id: number; name: string };

function page(
  snapshotId: number,
  data: TestItem[],
  total = data.length,
): UsageMetadataPage<TestItem> {
  return {
    data,
    total,
    limit: 200,
    offset: 0,
    snapshot: {
      id: snapshotId,
      finished_at: "2026-08-06T12:00:00Z",
      summary: null,
    },
  };
}

describe("appendUniqueItems", () => {
  it("deduplicates IDs when mutable queue offsets overlap", () => {
    const firstPage = [
      { id: 1, name: "First" },
      { id: 2, name: "Second" },
    ];
    const overlappingPage = [
      { id: 2, name: "Second duplicate" },
      { id: 3, name: "Third" },
    ];

    expect(
      appendUniqueItems(firstPage, overlappingPage, (item) => item.id),
    ).toEqual([
      { id: 1, name: "First" },
      { id: 2, name: "Second" },
      { id: 3, name: "Third" },
    ]);
  });
});

describe("useUsageMetadataPages", () => {
  it("restarts pagination when a later page belongs to a new snapshot", async () => {
    const firstSnapshot = page(1, [{ id: 1, name: "Old first" }], 2);
    const newFirstPage = page(2, [{ id: 3, name: "New first" }], 2);
    const newSecondPage = page(2, [{ id: 4, name: "New second" }], 2);
    const fetchPage = jest
      .fn<Promise<UsageMetadataPage<TestItem>>, [object]>()
      .mockResolvedValueOnce(newSecondPage)
      .mockResolvedValueOnce(newSecondPage);
    let finishRefetch: (() => void) | undefined;
    const refetch = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefetch = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ firstPage }) =>
        useUsageMetadataPages(
          {},
          firstPage,
          undefined,
          false,
          fetchPage,
          (item) => item.id,
          refetch,
        ),
      { initialProps: { firstPage: firstSnapshot } },
    );

    await act(() => result.current.fetchNextPage());

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeUndefined();
    expect(result.current.data).toEqual(firstSnapshot);
    expect(result.current.isFetching).toBe(true);

    await act(async () => finishRefetch?.());
    expect(result.current.isFetching).toBe(false);

    rerender({ firstPage: newFirstPage });
    await waitFor(() => expect(result.current.data).toEqual(newFirstPage));

    await act(() => result.current.fetchNextPage());

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeUndefined();
    expect(result.current.data?.data).toEqual([
      { id: 3, name: "New first" },
      { id: 4, name: "New second" },
    ]);
  });
});
