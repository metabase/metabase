import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { FormCollectionAndDashboardPicker } from "metabase/collections/containers/FormCollectionAndDashboardPicker";
import type { CollectionPickerModel } from "metabase/common/components/CollectionPicker";
import { FormFooter } from "metabase/core/components/FormFooter";
import { FormDashboardTabSelect } from "metabase/dashboard/components/FormDashboardTabSelect";
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
import type {
  CardType,
  CollectionId,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";

const QUESTION_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(QUESTION_NAME_MAX_LENGTH, Errors.maxLength)
    .default(""),
  description: Yup.string().nullable().default(null),
  collection_id: Yup.number().nullable().default(null),
});

const MAYBE_DASHBOARD_QUESTION_SCHEMA = QUESTION_SCHEMA.shape({
  dashboard_id: Yup.number().nullable().default(undefined),
  dashboard_tab_id: Yup.number().default(undefined),
});

export type CopyQuestionProperties = {
  name: string;
  description: string | null;
  collection_id: CollectionId | null;
  dashboard_id?: DashboardId | null | undefined;
  dashboard_tab_id?: DashboardTabId | undefined;
};

type CopyQuestionFormProps = {
  initialValues: Partial<CopyQuestionProperties>;
  onCancel: () => void;
  onSubmit: (vals: CopyQuestionProperties) => Promise<Question>;
  onSaved: (
    newQuestion: Question,
    options?: { dashboardTabId: DashboardTabId | undefined },
  ) => void;
  model?: CardType;
};

export const CopyQuestionForm = ({
  initialValues,
  onCancel,
  onSubmit,
  onSaved,
  model,
}: CopyQuestionFormProps) => {
  const formProviderProps = useMemo(() => {
    return model === "question"
      ? {
          validationSchema: MAYBE_DASHBOARD_QUESTION_SCHEMA,
          initialValues: {
            ...MAYBE_DASHBOARD_QUESTION_SCHEMA.getDefault(),
            ...initialValues,
          },
        }
      : {
          validationSchema: QUESTION_SCHEMA,
          initialValues: {
            ...QUESTION_SCHEMA.getDefault(),
            ...initialValues,
          },
        };
  }, [initialValues, model]);

  const handleDuplicate = async (vals: CopyQuestionProperties) => {
    const dashboardTabId = _.isString(vals.dashboard_tab_id)
      ? parseInt(vals.dashboard_tab_id, 10)
      : vals.dashboard_tab_id;

    const newQuestion = await onSubmit({
      ...vals,
      dashboard_tab_id: dashboardTabId,
    });
    onSaved?.(newQuestion, { dashboardTabId });
  };

  const models: CollectionPickerModel[] =
    model === "question" ? ["collection", "dashboard"] : ["collection"];

  return (
    <FormProvider
      {...formProviderProps}
      onSubmit={handleDuplicate}
      enableReinitialize
      // shows validation errors if the name is too long for being saved
      initialTouched={{ name: true }}
    >
      {({ values }) => (
        <Form>
          <Stack gap="md" mb="md">
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
            <div>
              <FormCollectionAndDashboardPicker
                collectionIdFieldName="collection_id"
                dashboardIdFieldName="dashboard_id"
                dashboardTabIdFieldName="dashboard_tab_id"
                title={t`Where do you want to save this?`}
                collectionPickerModalProps={{
                  models,
                  recentFilter: (items) =>
                    items.filter((item) => {
                      // narrow type and make sure it's a dashboard or
                      // collection that the user can write to
                      return item.model !== "table" && item.can_write;
                    }),
                }}
              />
              <FormDashboardTabSelect
                name="dashboard_tab_id"
                label="Which tab should this go on?"
                dashboardId={values.dashboard_id}
              />
            </div>
          </Stack>
          <FormFooter>
            <FormErrorMessage inline />
            {!!onCancel && (
              <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
            )}
            <FormSubmitButton label={t`Duplicate`} variant="filled" />
          </FormFooter>
        </Form>
      )}
    </FormProvider>
  );
};
