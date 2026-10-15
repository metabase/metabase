import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useCreateDocumentMutation } from "metabase/api";
import FormCollectionPicker from "metabase/common/collections/containers/FormCollectionPicker/FormCollectionPicker";
import { FormFooter } from "metabase/common/components/FormFooter";
import {
  DOCUMENT_TITLE_MAX_LENGTH,
  EMPTY_DOCUMENT_CONTENT,
} from "metabase/documents/constants";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { useNavigate } from "metabase/router";
import { Button, Modal, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Errors from "metabase/utils/errors";
import type { CollectionId } from "metabase-types/api";

import type { LibrarySectionCreateModalProps } from "../../../components/LibrarySectionPage";
import { LIBRARY_COLLECTION_PICKER_OPTIONS } from "../../../constants";
import { trackDataStudioDocumentCreated } from "../../analytics";

const getValidationSchema = () =>
  Yup.object({
    name: Yup.string()
      .required(Errors.required)
      .max(DOCUMENT_TITLE_MAX_LENGTH, Errors.maxLength)
      .default(""),
    collection_id: Yup.number().required(Errors.required),
  });

type CreateLibraryDocumentValues = {
  name: string;
  collection_id: CollectionId;
};

export function CreateLibraryDocumentModal({
  opened,
  collectionId,
  onClose,
}: LibrarySectionCreateModalProps) {
  const navigate = useNavigate();
  const [createDocument] = useCreateDocumentMutation();

  const validationSchema = useMemo(getValidationSchema, []);
  const initialValues = useMemo(
    () => ({ ...validationSchema.getDefault(), collection_id: collectionId }),
    [validationSchema, collectionId],
  );

  const handleSubmit = async (values: CreateLibraryDocumentValues) => {
    const document = await createDocument({
      ...values,
      document: EMPTY_DOCUMENT_CONTENT,
    }).unwrap();
    trackDataStudioDocumentCreated(document.id);
    navigate(Urls.document(document));
  };

  return (
    <Modal opened={opened} title={t`New document`} size="lg" onClose={onClose}>
      <FormProvider
        initialValues={initialValues}
        enableReinitialize
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        <Form as={Stack} gap="lg">
          <FormTextInput
            labelProps={{ mb: "xxs" }}
            name="name"
            label={t`Name`}
            placeholder={t`What is the name of your document?`}
            data-autofocus
            mt="lg"
          />
          <FormCollectionPicker
            name="collection_id"
            title={t`Collection`}
            entityType="document"
            collectionPickerModalProps={{
              options: LIBRARY_COLLECTION_PICKER_OPTIONS,
            }}
          />
          <FormFooter>
            <FormErrorMessage inline />
            <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Create`} variant="filled" />
          </FormFooter>
        </Form>
      </FormProvider>
    </Modal>
  );
}
