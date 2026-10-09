import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useCreateDashboardMutation } from "metabase/api";
import FormCollectionPicker from "metabase/common/collections/containers/FormCollectionPicker/FormCollectionPicker";
import { FormFooter } from "metabase/common/components/FormFooter";
import type { EntityPickerOptions } from "metabase/common/components/Pickers";
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
import { useNavigate } from "metabase/router";
import { Button, Modal, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Errors from "metabase/utils/errors";
import type { CollectionId } from "metabase-types/api";

const DASHBOARD_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(DASHBOARD_NAME_MAX_LENGTH, Errors.maxLength)
    .default(""),
  description: Yup.string()
    .nullable()
    .max(DASHBOARD_DESCRIPTION_MAX_LENGTH, Errors.maxLength)
    .default(null),
  collection_id: Yup.number().required(Errors.required),
});

type CreateLibraryDashboardValues = {
  name: string;
  description: string | null;
  collection_id: CollectionId;
};

const LIBRARY_DASHBOARD_PICKER_OPTIONS: EntityPickerOptions = {
  hasLibrary: true,
  hasRootCollection: false,
  hasPersonalCollections: false,
  hasRecents: false,
  hasSearch: false,
  hasConfirmButtons: true,
  canCreateCollections: false,
};

type CreateLibraryDashboardModalProps = {
  opened: boolean;
  collectionId: CollectionId;
  onClose: () => void;
};

export function CreateLibraryDashboardModal({
  opened,
  collectionId,
  onClose,
}: CreateLibraryDashboardModalProps) {
  const navigate = useNavigate();
  const [createDashboard] = useCreateDashboardMutation();

  const initialValues = useMemo(
    () => ({ ...DASHBOARD_SCHEMA.getDefault(), collection_id: collectionId }),
    [collectionId],
  );

  const handleSubmit = async (values: CreateLibraryDashboardValues) => {
    const dashboard = await createDashboard(values).unwrap();
    navigate(Urls.dashboard(dashboard, { editMode: true }));
  };

  return (
    <Modal opened={opened} title={t`New dashboard`} size="lg" onClose={onClose}>
      <FormProvider
        initialValues={initialValues}
        enableReinitialize
        validationSchema={DASHBOARD_SCHEMA}
        onSubmit={handleSubmit}
      >
        <Form as={Stack} gap={0}>
          <FormTextInput
            labelProps={{ mb: "xxs" }}
            name="name"
            label={t`Name`}
            placeholder={t`What is the name of your dashboard?`}
            data-autofocus
            mt="lg"
          />
          <FormTextarea
            labelProps={{ mb: "xxs" }}
            name="description"
            label={t`Description`}
            placeholder={t`It's optional but oh, so helpful`}
            nullable
            autosize={false}
            minRows={5}
            maxRows={5}
            my="lg"
          />
          <FormCollectionPicker
            name="collection_id"
            title={t`Collection`}
            entityType="dashboard"
            collectionPickerModalProps={{
              options: LIBRARY_DASHBOARD_PICKER_OPTIONS,
            }}
          />
          <FormFooter mt="lg">
            <FormErrorMessage inline />
            <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Create`} variant="filled" />
          </FormFooter>
        </Form>
      </FormProvider>
    </Modal>
  );
}
