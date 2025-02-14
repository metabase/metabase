import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { FormCollectionAndDashboardPicker } from "metabase/collections/containers/FormCollectionAndDashboardPicker";
import type { CollectionPickerModel } from "metabase/common/components/CollectionPicker";
import { FormFooter } from "metabase/core/components/FormFooter";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { QUESTION_NAME_MAX_LENGTH } from "metabase/questions/constants";
import { Button, Stack } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";

const QUESTION_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(QUESTION_NAME_MAX_LENGTH, Errors.maxLength)
    .default(""),
  description: Yup.string().nullable().default(null),
  collection_id: Yup.number().nullable().default(null),
});

export type CopyQuestionProperties = {
  name: string;
  description: string | null;
  collection_id: CollectionId | null;
};

type CopyQuestionFormProps = {
  initialValues: Partial<CopyQuestionProperties>;
  onCancel: () => void;
  onSubmit: (vals: CopyQuestionProperties) => Promise<Question>;
  onSaved: (newQuestion: Question) => void;
  model?: string;
};

export const CopyQuestionForm = ({
  initialValues,
  onCancel,
  onSubmit,
  onSaved,
  model,
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

  const models: CollectionPickerModel[] =
    model === "question" ? ["collection", "dashboard"] : ["collection"];

  return (
    <FormProvider
      initialValues={computedInitialValues}
      validationSchema={QUESTION_SCHEMA}
      onSubmit={handleDuplicate}
      enableReinitialize
      // shows validation errors if the name is too long for being saved
      initialTouched={{
        name: true,
      }}
    >
      <Form>
        <Stack gap="md">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`What is the name of your dashboard?`}
            autoFocus
          />
          <FormTextarea
            name="description"
            label={t`Description`}
            placeholder={t`It's optional but oh, so helpful`}
            nullable
            minRows={4}
          />
          <FormCollectionAndDashboardPicker
            collectionIdFieldName="collection_id"
            dashboardIdFieldName="dashboard_id"
            title={t`Where do you want to save this?`}
            collectionPickerModalProps={{
              models,
              recentFilter: items =>
                items.filter(item => {
                  // narrow type and make sure it's a dashboard or
                  // collection that the user can write to
                  return item.model !== "table" && item.can_write;
                }),
            }}
          />
        </Stack>
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
