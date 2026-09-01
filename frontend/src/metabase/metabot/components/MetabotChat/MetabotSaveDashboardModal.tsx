import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import FormCollectionPicker from "metabase/common/collections/containers/FormCollectionPicker/FormCollectionPicker";
import { useInitialCollectionId } from "metabase/common/collections/hooks";
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
import { Button, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import type {
  CollectionId,
  SaveMetabotDashboardResponse,
  SaveMetabotDashboardTile,
} from "metabase-types/api";

import { useSaveMetabotDashboardMutation } from "../../api";

const SAVE_DASHBOARD_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(DASHBOARD_NAME_MAX_LENGTH, Errors.maxLength),
  description: Yup.string()
    .nullable()
    .max(DASHBOARD_DESCRIPTION_MAX_LENGTH, Errors.maxLength),
  collection_id: Yup.number().nullable(),
});

type SaveDashboardValues = {
  name: string;
  description: string | null;
  collection_id: CollectionId | null;
};

export function MetabotSaveDashboardModal({
  conversationId,
  dashboardId,
  name,
  description,
  tiles,
  onSaved,
  onClose,
}: {
  conversationId: string;
  dashboardId: string;
  name: string;
  description?: string;
  tiles: SaveMetabotDashboardTile[];
  onSaved: (saved: SaveMetabotDashboardResponse) => void;
  onClose: () => void;
}) {
  const initialCollectionId = useInitialCollectionId({});
  const [saveMetabotDashboard] = useSaveMetabotDashboardMutation();

  const initialValues: SaveDashboardValues = useMemo(
    () => ({
      name,
      description: description ?? null,
      collection_id: initialCollectionId,
    }),
    [name, description, initialCollectionId],
  );

  const handleSubmit = async (values: SaveDashboardValues) => {
    const saved = await saveMetabotDashboard({
      conversation_id: conversationId,
      dashboard_id: dashboardId,
      dashboard: { ...values, tiles },
    }).unwrap();
    onSaved(saved);
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={t`Save dashboard`}
      data-testid="save-dashboard-modal"
    >
      <FormProvider
        initialValues={initialValues}
        enableReinitialize
        validationSchema={SAVE_DASHBOARD_SCHEMA}
        onSubmit={handleSubmit}
      >
        <Form as={Stack} gap={0}>
          <FormTextInput
            labelProps={{ mb: "xs" }}
            name="name"
            label={t`Name`}
            data-autofocus
            mt="md"
          />
          <FormTextarea
            labelProps={{ mb: "xs" }}
            name="description"
            label={t`Description`}
            nullable
            autosize={false}
            minRows={3}
            maxRows={3}
            my="md"
          />
          <FormCollectionPicker
            name="collection_id"
            title={t`Which collection should this go in?`}
            entityType="dashboard"
          />
          <FormFooter mt="md">
            <FormErrorMessage inline />
            <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Save`} variant="filled" />
          </FormFooter>
        </Form>
      </FormProvider>
    </Modal>
  );
}
