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
  onSubmit: OnSubmitActionForm;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
}

const shouldPrefetchValues = (action: WritebackAction) =>
  action.type === "implicit" && action.kind === "row/update";

function ActionParametersInputForm({
  action,
  mappedParameters = [],
  initialValues = {},
  dashboard,
  dashcard,
  fetchInitialValues,
  onCancel,
  onSubmit,
  onSubmitSuccess,
}: ActionParametersInputFormProps) {
  const [prefetchedValues, setPrefetchedValues] =
    useState<ParametersForActionExecution>({});

  const hasPrefetchedValues = Object.keys(prefetchedValues).length > 0;
  const shouldPrefetch = useMemo(
    () => shouldPrefetchValues(action) && dashboard && dashcard,
    [action, dashboard, dashcard],
  );

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

  const refetchValues = useCallback(async () => {
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
        refetchValues();
      }
    }
  }, [
    shouldPrefetch,
    hasPrefetchedValues,
    dashboard,
    dashcard,
    initialValues,
    refetchValues,
  ]);

  const handleSubmit = useCallback(
    async (parameters, actions) => {
      actions.setSubmitting(true);
      const { success, error } = await onSubmit(parameters);
      if (success) {
        actions.setErrors({});
        onSubmitSuccess?.();

        if (shouldPrefetch) {
          refetchValues();
        } else {
          actions.resetForm();
        }
      } else {
        throw new Error(error);
      }
    },
    [shouldPrefetch, onSubmit, onSubmitSuccess, refetchValues],
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
