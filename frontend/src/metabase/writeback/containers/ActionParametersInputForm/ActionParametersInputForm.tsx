import React, { useCallback, useMemo, useState, useEffect } from "react";
import { t } from "ttag";
import Form from "metabase/containers/FormikForm";

import {
  getFormFieldForParameter,
  getSubmitButtonLabel,
  generateFieldSettingsFromParameters,
  getFormFromParameters,
} from "metabase/writeback/components/ActionCreator/FormCreator";
import EmptyState from "metabase/components/EmptyState";

import type {
  WritebackParameter,
  WritebackQueryAction,
  OnSubmitActionForm,
  Dashboard,
  ActionDashboardCard,
  ParametersForActionExecution,
} from "metabase-types/api";

import { ActionsApi } from "metabase/services";
import { shouldPrefetchValues } from "metabase/writeback/utils";

import {
  setDefaultValues,
  setNumericValues,
  getChangedValues,
  getInitialValues,
} from "./utils";

interface Props {
  missingParameters: WritebackParameter[];
  dashcardParamValues: ParametersForActionExecution;

  action: WritebackQueryAction;
  dashboard?: Dashboard;
  dashcard?: ActionDashboardCard;
  onSubmit: OnSubmitActionForm;
  onSubmitSuccess?: () => void;
}

function ActionParametersInputForm({
  missingParameters,
  dashcardParamValues,
  action,
  dashboard,
  dashcard,
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
        slug: action.slug,
        parameters: JSON.stringify(dashcardParamValues),
      }).then(setPrefetchValues),
    [action.slug, dashboard?.id, dashcard?.id, dashcardParamValues],
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
      generateFieldSettingsFromParameters(missingParameters),
    [action, missingParameters],
  );

  const form = useMemo(
    () => getFormFromParameters(missingParameters, fieldSettings),
    [missingParameters, fieldSettings],
  );

  const initialValues = useMemo(
    () => getInitialValues(form, prefetchValues),
    [form, prefetchValues],
  );

  const handleSubmit = useCallback(
    async (params, actions) => {
      actions.setSubmitting(true);
      const paramsWithDefaultValues = setDefaultValues(params, fieldSettings);
      const paramsWithNumericValues = setNumericValues(
        paramsWithDefaultValues,
        fieldSettings,
      );
      const paramsWithChangedValues = getChangedValues(
        paramsWithNumericValues,
        initialValues,
      );

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
      fieldSettings,
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

  return (
    <Form
      form={form}
      initialValues={initialValues}
      overwriteOnInitialValuesChange
      onSubmit={handleSubmit}
      submitTitle={submitButtonLabel}
    />
  );
}

export default ActionParametersInputForm;
