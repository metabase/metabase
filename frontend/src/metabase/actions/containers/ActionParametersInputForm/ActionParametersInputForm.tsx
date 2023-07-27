import type { FormikHelpers } from "formik";
import { useCallback, useEffect, useMemo } from "react";
import { useAsyncFn } from "react-use";

import ActionForm from "metabase/actions/components/ActionForm";

import type {
  OnSubmitActionForm,
  ParametersForActionExecution,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

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

const NO_VALUES: ParametersForActionExecution = {};

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

function ActionParametersInputForm({
  action,
  mappedParameters = [],
  initialValues = {},
  prefetchesInitialValues,
  onCancel,
  onSubmit,
  onSubmitSuccess,
}: ActionParametersInputFormProps) {
  const hiddenFields = useMemo(() => {
    const hiddenFieldIds = Object.values(
      action.visualization_settings?.fields ?? {},
    )
      .filter(field => field.hidden)
      .map(field => field.id);

    return mappedParameters
      .map(parameter => parameter.id)
      .concat(hiddenFieldIds);
  }, [mappedParameters, action.visualization_settings?.fields]);

  const handleSubmit = useCallback(
    async (parameters, actions) => {
      actions.setSubmitting(true);
      const { success, error } = await onSubmit(parameters);
      if (success) {
        actions.setErrors({});
        onSubmitSuccess?.(actions);

        // if (shouldPrefetch) {
        //   prefetchValues();
        // } else {
        //   actions.resetForm();
        // }
      } else {
        throw new Error(error);
      }
    },
    [onSubmit, onSubmitSuccess],
  );

  // if (shouldPrefetch && !hasPrefetchedValues) {
  //   return <EmptyState message={t`Choose a record to update`} />;
  // }

  return (
    <ActionForm
      action={action}
      initialValues={initialValues}
      prefetchesInitialValues={prefetchesInitialValues}
      hiddenFields={hiddenFields}
      onSubmit={handleSubmit}
      onClose={onCancel}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionParametersInputForm;
