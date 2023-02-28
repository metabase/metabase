import React, { useCallback, useMemo, useState, useEffect } from "react";
import { t } from "ttag";
import { ActionForm } from "metabase/actions/components/ActionForm";

import {
  getSubmitButtonColor,
  getSubmitButtonLabel,
} from "metabase/actions/containers/ActionCreator/FormCreator";
import EmptyState from "metabase/components/EmptyState";

import type {
  WritebackParameter,
  OnSubmitActionForm,
  Dashboard,
  ActionDashboardCard,
  ParametersForActionExecution,
  ActionFormSettings,
  WritebackAction,
} from "metabase-types/api";

import { ActionsApi, PublicApi } from "metabase/services";
import {
  shouldPrefetchValues,
  generateFieldSettingsFromParameters,
} from "metabase/actions/utils";
import { getDashboardType } from "metabase/dashboard/utils";

import type Field from "metabase-lib/metadata/Field";

import { getChangedValues, getInitialValues } from "./utils";

export interface ActionParamatersInputFormProps {
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

function ActionParametersInputForm({
  action,
  missingParameters = action.parameters,
  dashcardParamValues = {},
  dashboard,
  dashcard,
  onCancel,
  onSubmit,
  onSubmitSuccess,
}: ActionParamatersInputFormProps) {
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

  const fieldSettings = useMemo(
    () =>
      action.visualization_settings?.fields ??
      // if there are no field settings, we generate them from the parameters and field metadata
      generateFieldSettingsFromParameters(
        missingParameters,
        dashcard?.card?.result_metadata as unknown as Field[],
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
