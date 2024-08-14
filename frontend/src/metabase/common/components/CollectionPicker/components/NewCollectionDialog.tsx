import { t } from "ttag";

import { useCreateCollectionMutation } from "metabase/api";
import FormFooter from "metabase/core/components/FormFooter";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Flex, Modal } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { ENTITY_PICKER_Z_INDEX } from "../../EntityPicker";
import type { CollectionPickerItem } from "../types";

interface NewCollectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentCollectionId: CollectionId | null;
  onNewCollection: (item: CollectionPickerItem) => void;
  namespace?: "snippets";
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
    const newCollection = await createCollection({
      name,
      parent_id: parentCollectionId === "root" ? null : parentCollectionId,
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
      zIndex={ENTITY_PICKER_Z_INDEX}
    >
      <FormProvider
        initialValues={{ name: "" }}
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
