import { t } from "ttag";
import type { SearchResult } from "metabase-types/api";
import FormFooter from "metabase/core/components/FormFooter";
import {
  Form,
  FormProvider,
  FormTextInput,
  FormErrorMessage,
  FormSubmitButton,
} from "metabase/forms";
import { Button } from "metabase/ui";

interface NewCollectionModalProps {
  onClose: () => void;
  parentCollection: SearchResult | null;
  handleCreateNewCollection: (val: { name: string }) => void;
}

export const NewCollectionModal = ({
  onClose,
  parentCollection,
  handleCreateNewCollection,
}: NewCollectionModalProps) => {
  return (
    <FormProvider
      initialValues={{ name: "" }}
      onSubmit={handleCreateNewCollection}
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
  );
};
