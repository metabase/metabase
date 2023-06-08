import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  forwardRef,
  Ref,
} from "react";
import { t } from "ttag";
import _ from "underscore";

import EmptyState from "metabase/components/EmptyState";

import { ActionsApi, PublicApi } from "metabase/services";

import ActionForm, {
  ActionFormRefData,
} from "metabase/actions/components/ActionForm";
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
  dashboard?: Dashboard;
  dashcard?: ActionDashboardCard;
  mappedParameters?: WritebackParameter[];
  initialValues?: ParametersForActionExecution;
  dashcardParamValues?: ParametersForActionExecution;
  onSubmit: OnSubmitActionForm;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
}

const shouldPrefetchValues = (action: WritebackAction) =>
  action.type === "implicit" && action.kind === "row/update";

const ActionParametersInputForm = forwardRef(function ActionParametersInputForm(
  {
    action,
    mappedParameters = [],
    dashcardParamValues = {},
    initialValues: initialValuesProp = {},
    dashboard,
    dashcard,
    onCancel,
    onSubmit,
    onSubmitSuccess,
  }: ActionParametersInputFormProps,
  ref: Ref<ActionFormRefData>,
) {
  const [prefetchedValues, setPrefetchedValues] =
    useState<ParametersForActionExecution>({});

  const hasPrefetchedValues = Object.keys(prefetchedValues).length > 0;
  const shouldPrefetch = useMemo(
    () => shouldPrefetchValues(action) && dashboard && dashcard,
    [action, dashboard, dashcard],
  );

  const initialValues = useMemo(
    () => ({
      ...prefetchedValues,
      ...dashcardParamValues,
      ...initialValuesProp,
    }),
    [initialValuesProp, prefetchedValues, dashcardParamValues],
  );

  const hiddenFields = useMemo(
    () => mappedParameters.map(parameter => parameter.id),
    [mappedParameters],
  );

  const fetchInitialValues = useCallback(async () => {
    const prefetchEndpoint =
      getDashboardType(dashboard?.id) === "public"
        ? PublicApi.prefetchValues
        : ActionsApi.prefetchValues;

    const fetchedValues = await prefetchEndpoint({
      dashboardId: dashboard?.id,
      dashcardId: dashcard?.id,
      parameters: JSON.stringify(dashcardParamValues),
    }).catch(_.noop);

    if (fetchedValues) {
      setPrefetchedValues(fetchedValues);
    }
  }, [dashboard?.id, dashcard?.id, dashcardParamValues]);

  useEffect(() => {
    const hasValueFromDashboard = Object.keys(dashcardParamValues).length > 0;
    const canPrefetch = hasValueFromDashboard && dashboard && dashcard;

    if (shouldPrefetch && !hasPrefetchedValues) {
      setPrefetchedValues({});
      canPrefetch && fetchInitialValues();
    }
  }, [
    shouldPrefetch,
    hasPrefetchedValues,
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

  if (shouldPrefetch && !hasPrefetchedValues) {
    return <EmptyState message={t`Choose a record to update`} />;
  }

  return (
    <ActionForm
      ref={ref}
      action={action}
      initialValues={initialValues}
      hiddenFields={hiddenFields}
      onSubmit={handleSubmit}
      onClose={onCancel}
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionParametersInputForm;
