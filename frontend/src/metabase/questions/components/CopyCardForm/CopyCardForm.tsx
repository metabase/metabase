import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { FormCollectionAndDashboardPicker } from "metabase/collections/containers/FormCollectionAndDashboardPicker";
import { getEntityTypeFromCardType } from "metabase/collections/utils";
import { FormFooter } from "metabase/common/components/FormFooter";
import type { OmniPickerItem } from "metabase/common/components/Pickers";
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
import type {
  Card,
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

export type CopyCardProperties = {
  name: string;
  description: string | null;
  collection_id: CollectionId | null;
  dashboard_id?: DashboardId | null | undefined;
  dashboard_tab_id?: DashboardTabId | undefined;
};

type CopyCardFormProps = {
  initialValues: Partial<CopyCardProperties>;
  model?: CardType;
  onSubmit: (vals: CopyCardProperties) => Promise<Card>;
  onSaved: (
    newCard: Card,
    options?: { dashboardTabId: DashboardTabId | undefined },
  ) => void;
  onCancel: () => void;
};

export const CopyCardForm = ({
  initialValues,
  onCancel,
  onSubmit,
  onSaved,
  model,
}: CopyCardFormProps) => {
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

  const handleDuplicate = async (vals: CopyCardProperties) => {
    const dashboardTabId = _.isString(vals.dashboard_tab_id)
      ? parseInt(vals.dashboard_tab_id, 10)
      : vals.dashboard_tab_id;

    const newCard = await onSubmit({
      ...vals,
      dashboard_tab_id: dashboardTabId,
    });
    onSaved?.(newCard, { dashboardTabId });
  };

  const models: OmniPickerItem["model"][] =
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
                entityType={
                  model ? getEntityTypeFromCardType(model) : undefined
                }
                collectionPickerModalProps={{ models }}
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
