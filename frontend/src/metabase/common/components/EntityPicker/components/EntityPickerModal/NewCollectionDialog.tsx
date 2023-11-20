import { t } from "ttag";

import { useCollectionQuery } from "metabase/common/hooks";
import FormFooter from "metabase/core/components/FormFooter";
import Collections from "metabase/entities/collections";
import {
  Form,
  FormProvider,
  FormTextInput,
  FormErrorMessage,
  FormSubmitButton,
} from "metabase/forms";
import { useDispatch } from "metabase/lib/redux";
import { Modal, Button, Loader } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

interface NewCollectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentCollectionId: CollectionId;
}

export const NewCollectionDialog = ({
  isOpen,
  onClose,
  parentCollectionId,
}: NewCollectionDialogProps) => {
  const dispatch = useDispatch();

  const onCreateNewCollection = async ({ name }: { name: string }) => {
    await dispatch(
      Collections.actions.create({
        name,
        parent_id: parentCollectionId === "root" ? null : parentCollectionId,
      }),
    );
    onClose();
  };

  const { data, isLoading } = useCollectionQuery({ id: parentCollectionId });

  return (
    <Modal
      title="Create New"
      opened={isOpen}
      onClose={onClose}
      data-testid="create-collection-on-the-go"
      trapFocus={true}
    >
      {isLoading ? (
        <Loader />
      ) : (
        <FormProvider
          initialValues={{ name: "" }}
          onSubmit={onCreateNewCollection}
        >
          {({ dirty }: { dirty: boolean }) => (
            <Form>
              <FormTextInput
                name="name"
                label={t`Name of new folder inside "${data?.name}"`}
                placeholder={t`My new collection`}
                mb="1rem"
                data-autofocus
              />
              <FormFooter>
                <FormErrorMessage inline />
                <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
                <FormSubmitButton
                  label={t`Create`}
                  disabled={!dirty}
                  variant="filled"
                />
              </FormFooter>
            </Form>
          )}
        </FormProvider>
      )}
    </Modal>
  );
};
