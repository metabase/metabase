import { renderHook, waitFor } from "@testing-library/react";

import type { ParametersForActionExecution } from "metabase-types/api";

import { useActionInitialValues } from "./use-action-initial-values";

const createFetcher = (values: ParametersForActionExecution) =>
  jest
    .fn<Promise<ParametersForActionExecution>, []>()
    .mockResolvedValue(values);

describe("useActionInitialValues", () => {
  it("should prefetch initial values on mount when shouldPrefetch is set", async () => {
    const fetchInitialValues = createFetcher({ id: 5 });

    const { result } = renderHook(() =>
      useActionInitialValues({ fetchInitialValues, shouldPrefetch: true }),
    );

    await waitFor(() =>
      expect(result.current.initialValues).toEqual({ id: 5 }),
    );
    expect(result.current.hasPrefetchedValues).toBe(true);
    expect(fetchInitialValues).toHaveBeenCalledTimes(1);
  });

  it("should refetch initial values when fetchInitialValues changes after a prefetch (metabase#33084)", async () => {
    const fetchForId5 = createFetcher({ id: 5 });
    const fetchForId10 = createFetcher({ id: 10 });

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
