import { t } from "ttag";
import { Modal, Button } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";
import FormFooter from "metabase/core/components/FormFooter";
import { useDispatch } from "metabase/lib/redux";
import Collections from "metabase/entities/collections";

import {
  Form,
  FormProvider,
  FormTextInput,
  FormErrorMessage,
  FormSubmitButton,
} from "metabase/forms";

interface NewCollectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentCollection: SearchResult | null;
}

export const NewCollectionDialog = ({
  isOpen,
  onClose,
  parentCollection,
}: NewCollectionDialogProps) => {
  const dispatch = useDispatch();

  const onCreateNewCollection = async ({ name }: { name: string }) => {
    await dispatch(
      Collections.actions.create({ name, parent_id: parentCollection?.id }),
    );
    onClose();
  };

  return (
    <Modal title="Create New" opened={isOpen} onClose={onClose}>
      <FormProvider
        initialValues={{ name: "" }}
        onSubmit={onCreateNewCollection}
      >
        {({ dirty }: { dirty: boolean }) => (
          <Form>
            <FormTextInput
              name="name"
              label={t`Name of new folder inside "${parentCollection?.name}"`}
              placeholder={t`Johnny`}
              mb="1rem"
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
    </Modal>
  );
};
