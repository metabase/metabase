import { t } from "ttag";
import * as Yup from "yup";

import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import { FormFooter } from "metabase/common/components/FormFooter";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Stack } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

type CopyDocumentProperties = {
  collection_id: CollectionId | null;
  name: string;
};

type DocumentCopyFormProps = {
  initialValues: Partial<CopyDocumentProperties>;
  onCancel: () => void;
  onSubmit: (vals: CopyDocumentProperties) => Promise<Document>;
  onSaved: (doc: Document) => void;
};

const VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required().default(""),
  collection_id: Yup.number().nullable().default(null),
});

export const DocumentCopyForm = ({
  initialValues,
  onCancel,
  onSubmit,
  onSaved,
}: DocumentCopyFormProps) => {
  const handleSubmit = async (vals: CopyDocumentProperties) => {
    const { name, collection_id } = vals;

    const newDoc = await onSubmit({ name, collection_id });

    onSaved?.(newDoc);
  };

  return (
    <FormProvider
      initialValues={{ ...VALIDATION_SCHEMA.getDefault(), ...initialValues }}
      validationSchema={VALIDATION_SCHEMA}
      onSubmit={handleSubmit}
      enableReinitialize
    >
      {() => (
        <Form>
          <Stack gap="md" mb="md">
            <FormTextInput
              name="name"
              label={t`Name`}
              placeholder={t`What is the name of your dashboard?`}
              autoFocus
            />
            <div>
              <FormCollectionPicker
                name="collection_id"
                title={t`Folder this document should be copied to`}
                entityType="document"
              />
            </div>
          </Stack>
          <FormFooter>
            {!!onCancel && (
              <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
            )}
            <FormSubmitButton label={t`Copy`} variant="primary" />
          </FormFooter>
        </Form>
      )}
    </FormProvider>
  );
};
