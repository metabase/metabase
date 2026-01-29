import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useCreateDashboardMutation } from "metabase/api";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";
import { FormFooter } from "metabase/common/components/FormFooter";
import type { FilterItemsInPersonalCollection } from "metabase/common/components/Pickers";
import { Collections } from "metabase/entities/collections";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import { Button, Stack } from "metabase/ui";
import type { CollectionId, Dashboard } from "metabase-types/api";

import {
  DASHBOARD_DESCRIPTION_MAX_LENGTH,
  DASHBOARD_NAME_MAX_LENGTH,
} from "../constants";

const DASHBOARD_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(DASHBOARD_NAME_MAX_LENGTH, Errors.maxLength)
    .default(""),
  description: Yup.string()
    .nullable()
    .max(DASHBOARD_DESCRIPTION_MAX_LENGTH, Errors.maxLength)
    .default(null),
  collection_id: Yup.number().nullable(),
});

export interface CreateDashboardProperties {
  /**
   * Dashboard title
   */
  name: string;

  /**
   * Dashboard description
   */
  description: string | null;

  /**
   * @internal
   */
  collection_id: CollectionId;
}

export interface CreateDashboardFormOwnProps {
  collectionId?: CollectionId | null; // can be used by `getInitialCollectionId`
  onCreate?: (dashboard: Dashboard) => void;
  onCancel?: () => void;
  initialValues?: CreateDashboardProperties | null;
  filterPersonalCollections?: FilterItemsInPersonalCollection;
}

export function CreateDashboardForm({
  onCreate,
  onCancel,
  initialValues,
  filterPersonalCollections,
  collectionId,
}: CreateDashboardFormOwnProps) {
  const initialCollectionId = useSelector((state) =>
    Collections.selectors.getInitialCollectionId(state, { collectionId }),
  );

  const [handleCreateDashboard] = useCreateDashboardMutation();
  const computedInitialValues = useMemo(
    () => ({
      ...DASHBOARD_SCHEMA.getDefault(),
      collection_id: initialCollectionId,
      ...initialValues,
    }),
    [initialCollectionId, initialValues],
  );

  const handleCreate = useCallback(
    async (values: CreateDashboardProperties) => {
      const dashboard = await handleCreateDashboard(values).unwrap();
      if (dashboard) {
        onCreate?.(dashboard);
      }
    },
    [handleCreateDashboard, onCreate],
  );

  return (
    <FormProvider
      initialValues={computedInitialValues}
      enableReinitialize
      validationSchema={DASHBOARD_SCHEMA}
      onSubmit={handleCreate}
    >
      {() => (
        <Form as={Stack} gap={0}>
          <FormTextInput
            labelProps={{ mb: "xs" }}
            name="name"
            label={t`Name`}
            placeholder={t`What is the name of your dashboard?`}
            data-autofocus
            mt="md"
          />
          <FormTextarea
            labelProps={{ mb: "xs" }}
            name="description"
            label={t`Description`}
            placeholder={t`It's optional but oh, so helpful`}
            nullable
            autosize={false}
            minRows={5}
            maxRows={5}
            my="md"
          />
          <FormCollectionPicker
            name="collection_id"
            title={t`Which collection should this go in?`}
            filterPersonalCollections={filterPersonalCollections}
            entityType="dashboard"
          />
          <FormFooter>
            <FormErrorMessage inline />
            {!!onCancel && (
              <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
            )}
            <FormSubmitButton label={t`Create`} variant="filled" />
          </FormFooter>
        </Form>
      )}
    </FormProvider>
  );
}
