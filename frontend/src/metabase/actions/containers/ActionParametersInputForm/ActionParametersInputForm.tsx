import type { FormikHelpers } from "formik";
import { useCallback, useMemo } from "react";

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
    async (
      parameters: ParametersForActionExecution,
      actions: FormikHelpers<ParametersForActionExecution>,
    ) => {
      actions.setSubmitting(true);
      const { success, error } = await onSubmit(parameters);
      if (success) {
        actions.setErrors({});
        onSubmitSuccess?.(actions);
      } else {
        throw error;
      }
    },
    [onSubmit, onSubmitSuccess],
  );

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
