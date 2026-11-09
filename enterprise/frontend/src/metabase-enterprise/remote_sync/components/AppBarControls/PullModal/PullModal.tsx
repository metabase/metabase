import { t } from "ttag";

import { Button, Group, Modal, Stack, Text } from "metabase/ui";

type PullModalProps = {
  opened: boolean;
  branch: string;
  targetBranch: string;
  isPulling: boolean;
  onPull: (keepChanges: boolean) => void;
  onClose: () => void;
};

export const PullModal = ({
  opened,
  branch,
  targetBranch,
  isPulling,
  onPull,
  onClose,
}: PullModalProps) => (
  <Modal
    opened={opened}
    title={
      targetBranch === branch ? t`Pull changes` : t`Switch to ${targetBranch}`
    }
    onClose={onClose}
  >
    <Stack gap="lg">
      <Text>{t`You have changes that aren't pushed yet. Keep them on top of the pulled content, or discard them.`}</Text>
      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
        <Button
          color="negative"
          loading={isPulling}
          onClick={() => onPull(false)}
        >{t`Discard my changes`}</Button>
        <Button
          variant="filled"
          loading={isPulling}
          onClick={() => onPull(true)}
        >{t`Keep my changes`}</Button>
      </Group>
    </Stack>
  </Modal>
);
