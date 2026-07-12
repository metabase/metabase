import { renderHook, waitFor } from "@testing-library/react";

import type { ParametersForActionExecution } from "metabase-types/api";

import { useActionInitialValues } from "./use-action-initial-values";

describe("useActionInitialValues", () => {
  it("prefetches initial values on mount when shouldPrefetch is set", async () => {
    const fetchInitialValues = jest
      .fn()
      .mockResolvedValue({ id: 5 } as ParametersForActionExecution);

    const { result } = renderHook(() =>
      useActionInitialValues({ fetchInitialValues, shouldPrefetch: true }),
    );

    await waitFor(() =>
      expect(result.current.initialValues).toEqual({ id: 5 }),
    );
    expect(result.current.hasPrefetchedValues).toBe(true);
    expect(fetchInitialValues).toHaveBeenCalledTimes(1);
  });

  it("refetches initial values when fetchInitialValues changes after a prefetch (metabase#33084)", async () => {
    // Simulates selecting a different object in a dashboard action: the
    // fetcher closure changes, so the hook must reload the prefetched values.
    const fetchForId5 = jest
      .fn()
      .mockResolvedValue({ id: 5 } as ParametersForActionExecution);
    const fetchForId10 = jest
      .fn()
      .mockResolvedValue({ id: 10 } as ParametersForActionExecution);

    const { result, rerender } = renderHook(
      ({ fetchInitialValues }) =>
        useActionInitialValues({ fetchInitialValues, shouldPrefetch: true }),
      { initialProps: { fetchInitialValues: fetchForId5 } },
    );

    await waitFor(() =>
      expect(result.current.initialValues).toEqual({ id: 5 }),
    );

    rerender({ fetchInitialValues: fetchForId10 });

    await waitFor(() =>
      expect(result.current.initialValues).toEqual({ id: 10 }),
    );
    expect(fetchForId10).toHaveBeenCalledTimes(1);
  });
});
