import { t } from "ttag";
import * as Yup from "yup";

import { useCreateCollectionMutation } from "metabase/api";
import { FormFooter } from "metabase/common/components/FormFooter";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Button, Flex, Modal } from "metabase/ui";
import type { CollectionId, CollectionNamespace } from "metabase-types/api";

import type { CollectionPickerItem } from "../types";

const NEW_COLLECTION_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
});

interface NewCollectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentCollectionId: CollectionId | null;
  onNewCollection: (item: CollectionPickerItem) => void;
  namespace?: CollectionNamespace;
}

export const NewCollectionDialog = ({
  isOpen,
  onClose,
  parentCollectionId,
  onNewCollection,
  namespace,
}: NewCollectionDialogProps) => {
  const [createCollection] = useCreateCollectionMutation();

  const onCreateNewCollection = async ({ name }: { name: string }) => {
    // Virtual collection IDs like "root" and "tenant" should be converted to null
    // These represent namespace roots which have no parent
    const isVirtualRoot =
      parentCollectionId === "root" || parentCollectionId === "tenant";

    const newCollection = await createCollection({
      name,
      parent_id: isVirtualRoot ? null : parentCollectionId,
      namespace,
    }).unwrap();

    onNewCollection({ ...newCollection, model: "collection" });
    onClose();
  };

  return (
    <Modal
      title={t`Create a new collection`}
      opened={isOpen}
      onClose={onClose}
      data-testid="create-collection-on-the-go"
      trapFocus={true}
      withCloseButton={false}
      //handle closing on escape manually, because Mantine captures the event which makes nested modal handling difficult
      closeOnEscape={false}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <FormProvider
        initialValues={{ name: "" }}
        validationSchema={NEW_COLLECTION_SCHEMA}
        onSubmit={onCreateNewCollection}
      >
        {({ dirty }: { dirty: boolean }) => (
          <Form>
            <FormTextInput
              name="name"
              label={t`Give it a name`}
              placeholder={t`My new collection`}
              mb="1rem"
              labelProps={{ my: "0.5rem" }}
              data-autofocus
            />
            <FormFooter>
              <FormErrorMessage inline />
              <Flex style={{ flexShrink: 1 }} justify="flex-end" gap="sm">
                <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
                <FormSubmitButton
                  type="submit"
                  label={t`Create`}
                  disabled={!dirty}
                  variant="filled"
                />
              </Flex>
            </FormFooter>
          </Form>
        )}
      </FormProvider>
    </Modal>
  );
};
