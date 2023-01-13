import React, { useCallback, useMemo, useState, useEffect } from "react";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";

import { ActionsApi } from "metabase/services";

import type {
  ActionDashboardCard,
  ActionFormSettings,
  Dashboard,
  OnSubmitActionForm,
  ParametersForActionExecution,
  WritebackParameter,
  WritebackQueryAction,
} from "metabase-types/api";

import { ActionForm } from "../ActionForm";
import {
  getChangedValues,
  getInitialValues,
  getSubmitButtonColor,
  getSubmitButtonLabel,
  generateFieldSettingsFromParameters,
  shouldPrefetchValues,
} from "../../utils";

interface Props {
  missingParameters: WritebackParameter[];
  dashcardParamValues: ParametersForActionExecution;

  action: WritebackQueryAction;
  dashboard?: Dashboard;
  dashcard?: ActionDashboardCard;
  onCancel?: () => void;
  submitButtonColor?: string;
  onSubmit: OnSubmitActionForm;
  onSubmitSuccess?: () => void;
}

function ActionParametersInputForm({
  missingParameters,
  dashcardParamValues,
  action,
  dashboard,
  dashcard,
  onCancel,
  onSubmit,
  onSubmitSuccess,
}: Props) {
  const [prefetchValues, setPrefetchValues] =
    useState<ParametersForActionExecution>({});

  const shouldPrefetch = useMemo(() => shouldPrefetchValues(action), [action]);

  const fetchInitialValues = useCallback(
    () =>
      ActionsApi.prefetchValues({
        dashboardId: dashboard?.id,
        dashcardId: dashcard?.id,
        parameters: JSON.stringify(dashcardParamValues),
      }).then(setPrefetchValues),
    [dashboard?.id, dashcard?.id, dashcardParamValues],
  );

  useEffect(() => {
    // we need at least 1 parameter value (a PK) to fetch initial values
    const canPrefetch =
      Object.keys(dashcardParamValues).length > 0 && dashboard && dashcard;

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

  const fieldSettings = useMemo(
    () =>
      action.visualization_settings?.fields ??
      // if there are no field settings, we generate them from the parameters and field metadata
      generateFieldSettingsFromParameters(
        missingParameters,
        dashcard?.card?.result_metadata,
      ),
    [action, missingParameters, dashcard],
  );

  const initialValues = useMemo(
    () => getInitialValues(fieldSettings, prefetchValues),
    [fieldSettings, prefetchValues],
  );

  const handleSubmit = useCallback(
    async (params, actions) => {
      actions.setSubmitting(true);
      const paramsWithChangedValues = getChangedValues(params, initialValues);

      const { success, error } = await onSubmit(paramsWithChangedValues);

      if (success) {
        actions.setErrors({});
        onSubmitSuccess?.();

        shouldPrefetch ? fetchInitialValues() : actions.resetForm();
      } else {
        throw new Error(error);
      }
    },
    [
      onSubmit,
      onSubmitSuccess,
      initialValues,
      fetchInitialValues,
      shouldPrefetch,
    ],
  );

  const hasPrefetchedValues = !!Object.keys(prefetchValues).length;

  if (shouldPrefetch && !hasPrefetchedValues) {
    return <EmptyState message={t`Choose a record to update`} />;
  }

  const submitButtonLabel = getSubmitButtonLabel(action);

  const formSettings: ActionFormSettings = action.visualization_settings ?? {
    type: "button",
    fields: fieldSettings,
  };

  return (
    <ActionForm
      parameters={missingParameters}
      formSettings={formSettings}
      initialValues={initialValues}
      onClose={onCancel}
      onSubmit={handleSubmit}
      submitTitle={submitButtonLabel}
      submitButtonColor={getSubmitButtonColor(action)}
    />
  );
}

export default ActionParametersInputForm;
