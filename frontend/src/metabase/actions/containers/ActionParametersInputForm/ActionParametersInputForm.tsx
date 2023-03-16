import React, { useCallback, useMemo, useState, useEffect } from "react";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";

import { ActionsApi, PublicApi } from "metabase/services";

import ActionForm from "metabase/actions/components/ActionForm";
import { getDashboardType } from "metabase/dashboard/utils";

import type {
  WritebackParameter,
  OnSubmitActionForm,
  Dashboard,
  ActionDashboardCard,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

export interface ActionParametersInputFormProps {
  action: WritebackAction;
  missingParameters?: WritebackParameter[];
  dashcardParamValues?: ParametersForActionExecution;
  dashboard?: Dashboard;
  dashcard?: ActionDashboardCard;
  onCancel?: () => void;
  submitButtonColor?: string;
  onSubmit: OnSubmitActionForm;
  onSubmitSuccess?: () => void;
}

const shouldPrefetchValues = (action: WritebackAction) =>
  action.type === "implicit" && action.kind === "row/update";

function ActionParametersInputForm({
  action,
  missingParameters = action.parameters,
  dashcardParamValues = {},
  dashboard,
  dashcard,
  onCancel,
  onSubmit,
  onSubmitSuccess,
}: ActionParametersInputFormProps) {
  const [prefetchValues, setPrefetchValues] =
    useState<ParametersForActionExecution>({});

  const shouldPrefetch = useMemo(
    () => shouldPrefetchValues(action) && dashboard && dashcard,
    [action, dashboard, dashcard],
  );

  const prefetchEndpoint =
    getDashboardType(dashboard?.id) === "public"
      ? PublicApi.prefetchValues
      : ActionsApi.prefetchValues;

  const fetchInitialValues = useCallback(async () => {
    const fetchedValues = await prefetchEndpoint({
      dashboardId: dashboard?.id,
      dashcardId: dashcard?.id,
      parameters: JSON.stringify(dashcardParamValues),
    }).catch(() => false);

    if (fetchedValues) {
      setPrefetchValues(fetchedValues);
    }
  }, [dashboard?.id, dashcard?.id, dashcardParamValues, prefetchEndpoint]);

  useEffect(() => {
    const hasValueFromDashboard = Object.keys(dashcardParamValues).length > 0;
    const canPrefetch = hasValueFromDashboard && dashboard && dashcard;

    if (shouldPrefetch) {
      setPrefetchValues({});
      canPrefetch && fetchInitialValues();
    }
  }, [
    shouldPrefetch,
    dashboard,
    dashcard,
    dashcardParamValues,
    fetchInitialValues,
  ]);

  const handleSubmit = useCallback(
    async (parameters, actions) => {
      actions.setSubmitting(true);
      const { success, error } = await onSubmit(parameters);

      if (success) {
        actions.setErrors({});
        onSubmitSuccess?.();

        shouldPrefetch ? fetchInitialValues() : actions.resetForm();
      } else {
        throw new Error(error);
      }
    },
    [shouldPrefetch, onSubmit, onSubmitSuccess, fetchInitialValues],
  );

  const hasPrefetchedValues = !!Object.keys(prefetchValues).length;

  if (shouldPrefetch && !hasPrefetchedValues) {
    return <EmptyState message={t`Choose a record to update`} />;
  }

  return (
    <ActionForm
      action={action}
      initialValues={prefetchValues}
      parameters={missingParameters}
      onSubmit={handleSubmit}
      onClose={onCancel}
    />
  );
}

export default ActionParametersInputForm;
