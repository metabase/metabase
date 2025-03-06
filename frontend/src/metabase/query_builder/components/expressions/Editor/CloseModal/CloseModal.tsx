import { t } from "ttag";

import { Box, Button, Flex, Modal, Stack, Text } from "metabase/ui";

export function CloseModal({
  closeModal,
  onClose,
}: {
  closeModal: () => void;
  onClose?: () => void;
}) {
  return (
    <Modal
      title={t`Keep editing your custom expression?`}
      opened
      onClose={closeModal}
      closeOnEscape
      closeButtonProps={{ style: { display: "none" } }}
      data-ignore-editor-clicks="true"
    >
      <Stack gap="md">
        <Box py="md">
          <Text>
            {t`You have changes that haven't been saved to your custom expression. You can continue editing it or discard the changes.`}
          </Text>
        </Box>

        <Flex justify="end" gap="sm">
          {onClose && (
            <Button onClick={onClose} variant="subtle">
              {t`Discard changes`}
            </Button>
          )}
          <Button onClick={closeModal} variant="primary">
            {t`Keep editing`}
          </Button>
        </Flex>
      </Stack>
    </Modal>
  );
}
