import { t } from "ttag";

import { useDeleteActionPublicLinkMutation } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Box, Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import type { WritebackActionId } from "metabase-types/api";

type DisablePublicLinkModalProps = {
  actionId: WritebackActionId;
  onClose: () => void;
};

export function DisablePublicLinkModal({
  actionId,
  onClose,
}: DisablePublicLinkModalProps) {
  const [deletePublicLink] = useDeleteActionPublicLinkMutation();

  const handleSubmit = async () => {
    await deletePublicLink({ id: actionId }).unwrap();
    onClose();
  };

  return (
    <Modal
      title={t`Disable this public link?`}
      opened
      padding="xxl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form>
          <Stack gap="xl">
            <Text>
              {t`The existing link will stop working. If you make the action public again, it will get a new link.`}
            </Text>
            <Group>
              <Box flex={1}>
                <FormErrorMessage />
              </Box>
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={t`Disable link`}
                variant="filled"
                color="negative"
              />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}
