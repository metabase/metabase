import { t } from "ttag";

import { useCreateDashboardMutation } from "metabase/api";
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

import type { DashboardPickerItem } from "../types";

interface NewDashboardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentCollectionId: CollectionId | null;
  onNewDashboard: (item: DashboardPickerItem) => void;
}

export const NewDashboardDialog = ({
  isOpen,
  onClose,
  parentCollectionId,
  onNewDashboard,
}: NewDashboardDialogProps) => {
  const [createDashboard] = useCreateDashboardMutation();

  const onCreateNewDashboard = async ({ name }: { name: string }) => {
    const newDashboard = await createDashboard({
      name,
      collection_id: parentCollectionId === "root" ? null : parentCollectionId,
    }).unwrap();

    onNewDashboard({
      ...newDashboard,
      collection_id: newDashboard.collection_id ?? "root",
      model: "dashboard",
    });
    onClose();
  };

  return (
    <Modal
      title={t`Create a new dashboard`}
      opened={isOpen}
      onClose={onClose}
      data-testid="create-dashboard-on-the-go"
      trapFocus={true}
      withCloseButton={false}
      styles={{
        content: {
          padding: "1rem",
        },
      }}
      zIndex={400} // needs to be above the EntityPickerModal at 400
    >
      <FormProvider
        initialValues={{ name: "" }}
        onSubmit={onCreateNewDashboard}
      >
        {({ dirty }: { dirty: boolean }) => (
          <Form>
            <FormTextInput
              name="name"
              label={t`Give it a name`}
              placeholder={t`My new dashboard`}
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
