import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import { connect } from "react-redux";

import Button from "metabase/core/components/Button";
import Form from "metabase/core/components/Form";
import FormFooter from "metabase/core/components/FormFooter";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormTextArea from "metabase/core/components/FormTextArea";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";

import * as Errors from "metabase/core/utils/errors";

import Actions, { CreateQueryActionOptions } from "metabase/entities/actions";

import FormModelPicker from "metabase/models/containers/FormModelPicker";

import type {
  ActionFormSettings,
  CardId,
  WritebackQueryAction,
} from "metabase-types/api";
import type { State } from "metabase-types/store";
import type Question from "metabase-lib/Question";

const ACTION_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
  description: Yup.string().nullable().max(255, Errors.maxLength).default(null),
  model_id: Yup.number().required(Errors.required),
});

type FormValues = Pick<
  CreateQueryActionOptions,
  "name" | "description" | "model_id"
>;

interface OwnProps {
  question: Question;
  formSettings: ActionFormSettings;
  modelId?: CardId;
  onCreate?: (values: WritebackQueryAction) => void;
  onCancel?: () => void;
}

interface DispatchProps {
  handleCreateAction: (
    action: CreateQueryActionOptions,
  ) => Promise<WritebackQueryAction>;
}

type Props = OwnProps & DispatchProps;

const mapDispatchToProps = {
  handleCreateAction: Actions.actions.create,
};

function CreateActionForm({
  question,
  formSettings,
  modelId,
  handleCreateAction,
  onCreate,
  onCancel,
}: Props) {
  const initialValues = useMemo(
    () => ({
      ...ACTION_SCHEMA.getDefault(),
      name: question.displayName(),
      description: question.description(),
      model_id: modelId,
    }),
    [question, modelId],
  );

  const handleCreate = useCallback(
    async (values: FormValues) => {
      const reduxAction = await handleCreateAction({
        ...values,
        question,
        formSettings,
      });
      const action = Actions.HACK_getObjectFromAction(reduxAction);
      onCreate?.(action);
    },
    [question, formSettings, handleCreateAction, onCreate],
  );

  return (
    <FormProvider
      initialValues={initialValues as FormValues}
      validationSchema={ACTION_SCHEMA}
      onSubmit={handleCreate}
    >
      {({ dirty }) => (
        <Form disabled={!dirty}>
          <FormInput
            name="name"
            title={t`Name`}
            placeholder={t`My new fantastic action`}
            autoFocus
          />
          <FormTextArea
            name="description"
            title={t`Description`}
            placeholder={t`It's optional but oh, so helpful`}
            nullable
          />
          <FormModelPicker name="model_id" title={t`Model it's saved in`} />
          <FormFooter>
            <FormErrorMessage inline />
            {!!onCancel && (
              <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
            )}
            <FormSubmitButton title={t`Create`} disabled={!dirty} primary />
          </FormFooter>
        </Form>
      )}
    </FormProvider>
  );
}

export default connect<unknown, DispatchProps, OwnProps, State>(
  null,
  mapDispatchToProps,
)(CreateActionForm);
