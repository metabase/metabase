import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";
import FormFooter from "metabase/core/components/FormFooter";
import {
  Form,
  FormTextInput,
  FormTextarea,
  FormProvider,
  FormSubmitButton,
  FormErrorMessage,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Button } from "metabase/ui";
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
  onSubmit: (vals: CopyQuestionProperties) => void;
  onSaved: () => void;
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
    await onSubmit(vals);
    onSaved?.();
  };

  return (
    <FormProvider
      initialValues={computedInitialValues}
      validationSchema={QUESTION_SCHEMA}
      onSubmit={handleDuplicate}
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
        <FormCollectionPicker
          name="collection_id"
          title={t`Which collection should this go in?`}
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
