import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import { useImportChangesMutation } from "metabase-enterprise/api";

import { trackBranchSwitched, trackPullChanges } from "../../../analytics";

type PullModalProps = {
  opened: boolean;
  branch: string;
  targetBranch: string;
  onClose: () => void;
};

export const PullModal = ({
  opened,
  branch,
  targetBranch,
  onClose,
}: PullModalProps) => (
  <Modal
    opened={opened}
    title={
      targetBranch === branch ? t`Pull changes` : t`Switch to ${targetBranch}`
    }
    onClose={onClose}
  >
    <ModalBody branch={branch} targetBranch={targetBranch} onClose={onClose} />
  </Modal>
);

type ModalBodyProps = {
  branch: string;
  targetBranch: string;
  onClose: () => void;
};

const ModalBody = ({ branch, targetBranch, onClose }: ModalBodyProps) => {
  const [importChanges, { isLoading }] = useImportChangesMutation();
  const [sendToast] = useToast();

  const handlePull = async (keepChanges: boolean) => {
    try {
      await importChanges({
        branch: targetBranch,
        expected_branch: branch,
        merge: keepChanges,
        force: !keepChanges,
      }).unwrap();
      if (targetBranch === branch) {
        trackPullChanges({ triggeredFrom: "app-bar", force: !keepChanges });
      } else {
        trackBranchSwitched({ triggeredFrom: "app-bar" });
      }
      onClose();
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't pull changes`),
        variant: "negative",
      });
    }
  };

  return (
    <Stack gap="lg">
      <Text>{t`You have changes that aren't pushed yet. Keep them on top of the pulled content, or discard them.`}</Text>
      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
        <Button
          color="negative"
          loading={isLoading}
          onClick={() => handlePull(false)}
        >{t`Discard my changes`}</Button>
        <Button
          variant="filled"
          loading={isLoading}
          onClick={() => handlePull(true)}
        >{t`Keep my changes`}</Button>
      </Group>
    </Stack>
  );
};
