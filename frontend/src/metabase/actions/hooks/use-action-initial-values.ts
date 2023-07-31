import type { FormikHelpers } from "formik";
import { useEffect, useMemo } from "react";
import { useAsyncFn } from "react-use";

import type {
  OnSubmitActionForm,
  ParametersForActionExecution,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

const NO_VALUES: ParametersForActionExecution = {};

export interface ActionParametersInputFormProps {
  action: WritebackAction;
  mappedParameters?: WritebackParameter[];
  initialValues?: ParametersForActionExecution;
  prefetchesInitialValues?: boolean;
  onSubmit: OnSubmitActionForm;
  onSubmitSuccess?: (
    actions: FormikHelpers<ParametersForActionExecution>,
  ) => void;
  onCancel?: () => void;
}

export const useActionInitialValues = ({
  fetchInitialValues,
  initialValues: initialValuesProp,
  shouldPrefetch,
}: {
  fetchInitialValues?: () => Promise<ParametersForActionExecution>;
  initialValues?: ParametersForActionExecution;
  shouldPrefetch?: boolean;
}) => {
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
