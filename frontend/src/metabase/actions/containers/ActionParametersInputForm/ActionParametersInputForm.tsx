import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";

import ActionForm from "metabase/actions/components/ActionForm";

import type {
  ActionDashboardCard,
  Dashboard,
  OnSubmitActionForm,
  ParametersForActionExecution,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

export interface ActionParametersInputFormProps {
  action: WritebackAction;
  dashboard?: Dashboard;
  dashcard?: ActionDashboardCard;
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
  dashboard,
  dashcard,
  fetchInitialValues,
  shouldPrefetch,
  onCancel,
  onSubmit,
  onSubmitSuccess,
}: ActionParametersInputFormProps) {
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
      // ignore silently
    }
  }, [fetchInitialValues]);

  useEffect(() => {
    const hasValueFromDashboard = Object.keys(initialValues).length > 0;
    const canPrefetch = hasValueFromDashboard && dashboard && dashcard;

    if (shouldPrefetch && !hasPrefetchedValues) {
      setPrefetchedValues({});

      if (canPrefetch) {
        prefetchValues();
      }
    }
  }, [
    shouldPrefetch,
    hasPrefetchedValues,
    dashboard,
    dashcard,
    initialValues,
    prefetchValues,
  ]);

  const handleSubmit = useCallback(
    async (parameters, actions) => {
      actions.setSubmitting(true);
      const { success, error } = await onSubmit(parameters);
      if (success) {
        actions.setErrors({});
        onSubmitSuccess?.();

        if (shouldPrefetch) {
          prefetchValues();
        } else {
          actions.resetForm();
        }
      } else {
        throw new Error(error);
      }
    },
    [shouldPrefetch, onSubmit, onSubmitSuccess, prefetchValues],
  );

  if (shouldPrefetch && !hasPrefetchedValues) {
    return <EmptyState message={t`Choose a record to update`} />;
  }

  return (
    <ActionForm
      action={action}
      initialValues={values}
      hiddenFields={hiddenFields}
      onSubmit={handleSubmit}
      onClose={onCancel}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionParametersInputForm;
