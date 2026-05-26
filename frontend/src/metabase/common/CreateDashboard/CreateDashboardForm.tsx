import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import type { SdkCollectionId } from "embedding-sdk-bundle/types";
import { useCreateDashboardMutation } from "metabase/api";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";
import { useInitialCollectionId } from "metabase/collections/hooks";
import { FormFooter } from "metabase/common/components/FormFooter";
import {
  DASHBOARD_DESCRIPTION_MAX_LENGTH,
  DASHBOARD_NAME_MAX_LENGTH,
} from "metabase/common/utils/dashboard";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Button, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import type { CollectionId, Dashboard } from "metabase-types/api";

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
  collection_id: CollectionId | null;
}

export interface CreateDashboardFormOwnProps {
  collectionId?: CollectionId | null; // can be used by `getInitialCollectionId`
  targetCollection?: SdkCollectionId | null;
  onCreate?: (dashboard: Dashboard) => void;
  onCancel?: () => void;
}

export function CreateDashboardForm({
  collectionId,
  targetCollection,
  onCreate,
  onCancel,
}: CreateDashboardFormOwnProps) {
  const initialCollectionId = useInitialCollectionId({ collectionId });

  // When passing `"root"` it will be resolved to `null`
  const hasTargetCollection = targetCollection !== undefined;

  const [handleCreateDashboard] = useCreateDashboardMutation();
  const computedInitialValues = useMemo(() => {
    return {
      ...DASHBOARD_SCHEMA.getDefault(),
      collection_id: hasTargetCollection
        ? targetCollection
        : initialCollectionId,
    };
  }, [hasTargetCollection, initialCollectionId, targetCollection]);

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
          {!hasTargetCollection && (
            <FormCollectionPicker
              name="collection_id"
              title={t`Which collection should this go in?`}
              entityType="dashboard"
            />
          )}
          <FormFooter mt="md">
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
