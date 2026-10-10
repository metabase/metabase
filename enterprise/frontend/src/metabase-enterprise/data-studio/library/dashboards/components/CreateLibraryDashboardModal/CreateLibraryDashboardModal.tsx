import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useCreateDashboardMutation } from "metabase/api";
import FormCollectionPicker from "metabase/common/collections/containers/FormCollectionPicker/FormCollectionPicker";
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
import type { CollectionId } from "metabase-types/api";

import { LIBRARY_COLLECTION_PICKER_OPTIONS } from "../../../constants";
import { trackDataStudioDashboardCreated } from "../../analytics";
import { useOpenDashboardEditor } from "../../hooks/use-open-dashboard-editor";

const getValidationSchema = () =>
  Yup.object({
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
  const openDashboardEditor = useOpenDashboardEditor();
  const [createDashboard] = useCreateDashboardMutation();

  const validationSchema = useMemo(getValidationSchema, []);
  const initialValues = useMemo(
    () => ({ ...validationSchema.getDefault(), collection_id: collectionId }),
    [validationSchema, collectionId],
  );

  const handleSubmit = async (values: CreateLibraryDashboardValues) => {
    const dashboard = await createDashboard(values).unwrap();
    trackDataStudioDashboardCreated(dashboard.id);
    openDashboardEditor(dashboard);
  };

  return (
    <Modal opened={opened} title={t`New dashboard`} size="lg" onClose={onClose}>
      <FormProvider
        initialValues={initialValues}
        enableReinitialize
        validationSchema={validationSchema}
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
              options: LIBRARY_COLLECTION_PICKER_OPTIONS,
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
