import { t } from "ttag";

import FormFooter from "metabase/core/components/FormFooter";
import Collections from "metabase/entities/collections";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { useDispatch } from "metabase/lib/redux";
import { Button, Flex, Modal } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import type { CollectionPickerItem } from "../types";

interface NewCollectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentCollectionId: CollectionId;
  onNewCollection: (item: CollectionPickerItem) => void;
}

export const NewCollectionDialog = ({
  isOpen,
  onClose,
  parentCollectionId,
  onNewCollection,
}: NewCollectionDialogProps) => {
  const dispatch = useDispatch();

  const onCreateNewCollection = async ({ name }: { name: string }) => {
    const {
      payload: { collection: newCollection },
    } = await dispatch(
      Collections.actions.create({
        name,
        parent_id: parentCollectionId === "root" ? null : parentCollectionId,
      }),
    );
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
      styles={{
        content: {
          padding: "1rem",
        },
      }}
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
