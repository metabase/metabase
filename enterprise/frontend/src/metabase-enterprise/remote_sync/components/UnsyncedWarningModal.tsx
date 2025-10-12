import { t } from "ttag";

import { Alert, Box, Button, Flex, Icon, List, Modal, Text } from "metabase/ui";

interface UnsyncedWarningModalProps {
  onClose: VoidFunction;
}

export const UnsyncedWarningModal = ({
  onClose,
}: UnsyncedWarningModalProps) => {
  return (
    <Modal onClose={onClose} opened title={t`You have unpublished changes`}>
      <Box>
        <Alert icon={<Icon name="warning" />} color="error" my="md">
          <Text>
            {t`Switching branches is not allowed while you have unsynced changes.`}
          </Text>
        </Alert>
        <Text mb="sm">
          {t`You have unsynced changes in the current branch. To switch branches, you must first push your changes.`}
        </Text>
        <Text>{t`You should either:`}</Text>
        <List>
          <List.Item>{t`Push your changes to the current branch.`}</List.Item>
          <List.Item>{t`If you can't push to the current branch, create a new branch and push.`}</List.Item>
        </List>

        <Flex align="center" justify="flex-end" mt="lg">
          <Button onClick={onClose}>{t`Understood`}</Button>
        </Flex>
      </Box>
    </Modal>
  );
};
