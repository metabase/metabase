import { useCallback, useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import EmptyState from "metabase/components/EmptyState";

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
  fetchInitialValues?: () => Promise<ParametersForActionExecution>;
  shouldPrefetch?: boolean;
  onSubmit: OnSubmitActionForm;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
}

function ActionParametersInputForm({
  action,
  mappedParameters = [],
  initialValues = {},
  fetchInitialValues,
  shouldPrefetch,
  onCancel,
  onSubmit,
  onSubmitSuccess = _.noop,
}: ActionParametersInputFormProps) {
  const onSubmitSuccessRef = useLatest(onSubmitSuccess);

  const [prefetchedValues, setPrefetchedValues] =
    useState<ParametersForActionExecution>({});

  const hasPrefetchedValues = Object.keys(prefetchedValues).length > 0;

  const values = useMemo(
    () => ({ ...prefetchedValues, ...initialValues }),
    [prefetchedValues, initialValues],
  );

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

  const prefetchValues = useCallback(async () => {
    if (!fetchInitialValues) {
      return;
    }

    try {
      const fetchedValues = await fetchInitialValues();
      setPrefetchedValues(fetchedValues);
    } catch (error) {
      // do not show user this error
      console.error(error);
    }
  }, [fetchInitialValues]);

  const prefetchValuesRef = useLatest(prefetchValues);

  useEffect(() => {
    if (shouldPrefetch && !hasPrefetchedValues) {
      setPrefetchedValues({});
      prefetchValues();
    }
  }, [shouldPrefetch, hasPrefetchedValues, prefetchValues]);

  const handleSubmit = useCallback(
    async (parameters, actions) => {
      actions.setSubmitting(true);
      const { success, error } = await onSubmit(parameters);
      if (success) {
        actions.setErrors({});
        onSubmitSuccessRef.current();

        if (shouldPrefetch) {
          prefetchValuesRef.current();
        } else {
          actions.resetForm();
        }
      } else {
        throw new Error(error);
      }
    },
    [shouldPrefetch, onSubmit, onSubmitSuccessRef, prefetchValuesRef],
  );

  if (shouldPrefetch && !hasPrefetchedValues) {
    return <EmptyState message={t`Choose a record to update`} />;
  }

  return (
    <ActionForm
      action={action}
      initialValues={values}
      prefetchesInitialValues={Boolean(fetchInitialValues)}
      hiddenFields={hiddenFields}
      onSubmit={handleSubmit}
      onClose={onCancel}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionParametersInputForm;
