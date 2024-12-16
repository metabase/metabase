import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { FormCollectionAndDashboardPicker } from "metabase/collections/containers/FormCollectionAndDashboardPicker";
import FormFooter from "metabase/core/components/FormFooter";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Button, DEFAULT_MODAL_Z_INDEX } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";

const QUESTION_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
  description: Yup.string().nullable().default(null),
  collection_id: Yup.number().nullable().default(null),
});

type CopyQuestionProperties = {
  name: string;
  description: string | null;
  collection_id: CollectionId | null;
};

interface CopyQuestionFormProps {
  initialValues: Partial<CopyQuestionProperties>;
  onCancel: () => void;
  onSubmit: (vals: CopyQuestionProperties) => Promise<Question>;
  onSaved: (newQuestion: Question) => void;
}

export const CopyQuestionForm = ({
  initialValues,
  onCancel,
  onSubmit,
  onSaved,
}: CopyQuestionFormProps) => {
  const computedInitialValues = useMemo<CopyQuestionProperties>(
    () => ({
      ...QUESTION_SCHEMA.getDefault(),
      ...initialValues,
    }),
    [initialValues],
  );

  const handleDuplicate = async (vals: CopyQuestionProperties) => {
    const newQuestion = await onSubmit(vals);
    onSaved?.(newQuestion);
  };

  return (
    <FormProvider
      initialValues={computedInitialValues}
      validationSchema={QUESTION_SCHEMA}
      onSubmit={handleDuplicate}
      enableReinitialize
    >
      <Form>
        <FormTextInput
          name="name"
          label={t`Name`}
          placeholder={t`What is the name of your dashboard?`}
          autoFocus
          mb="1.5rem"
        />
        <FormTextarea
          name="description"
          label={t`Description`}
          placeholder={t`It's optional but oh, so helpful`}
          nullable
          mb="1.5rem"
          minRows={4}
        />
        <FormCollectionAndDashboardPicker
          collectionIdFieldName="collection_id"
          dashboardIdFieldName="dashboard_id"
          title={t`Where do you want to save this?`}
          zIndex={DEFAULT_MODAL_Z_INDEX + 1}
        />
        <FormFooter>
          <FormErrorMessage inline />
          {!!onCancel && (
            <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
          )}
          <FormSubmitButton label={t`Duplicate`} variant="filled" />
        </FormFooter>
      </Form>
    </FormProvider>
  );
};
