import { useEffect, useMemo } from "react";
import { useAsyncFn } from "react-use";

import type { ParametersForActionExecution } from "metabase-types/api";

const NO_VALUES: ParametersForActionExecution = {};

interface Options {
  fetchInitialValues?: () => Promise<ParametersForActionExecution>;
  initialValues?: ParametersForActionExecution;
  shouldPrefetch?: boolean;
}

export const useActionInitialValues = ({
  fetchInitialValues,
  initialValues: initialValuesProp,
  shouldPrefetch,
}: Options) => {
  const [
    { error, loading: isLoading, value: prefetchedInitialValues = NO_VALUES },
    prefetchValues,
  ] = useAsyncFn(async () => fetchInitialValues?.(), [fetchInitialValues]);

  const hasPrefetchedValues = Object.keys(prefetchedInitialValues).length > 0;

  const initialValues = useMemo(
    () => ({ ...prefetchedInitialValues, ...initialValuesProp }),
    [prefetchedInitialValues, initialValuesProp],
  );

  useEffect(() => {
    if (shouldPrefetch && fetchInitialValues) {
      prefetchValues();
    }
  }, [shouldPrefetch, fetchInitialValues, prefetchValues]);

  return {
    error,
    hasPrefetchedValues,
    initialValues,
    isLoading: Boolean(isLoading && fetchInitialValues && shouldPrefetch),
    prefetchValues,
  };
};
