import { t } from "ttag";

import { useCreateDashboardMutation } from "metabase/api";
import { FormFooter } from "metabase/common/components/FormFooter";
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
      //handle closing on escape manually, because Mantine captures the event which makes nested modal handling difficult
      closeOnEscape={false}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      styles={{
        content: {
          padding: "1rem",
        },
      }}
    >
      <FormProvider
        initialValues={{ name: "" }}
        onSubmit={onCreateNewDashboard}
      >
        {({ dirty, isSubmitting }) => (
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
                  disabled={!dirty || isSubmitting}
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
