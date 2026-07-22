import { useState } from "react";
import { t } from "ttag";

import {
  Button,
  Combobox,
  Icon,
  Modal,
  Stack,
  Text,
  useCombobox,
} from "metabase/ui";

import { BranchDropdown } from "../../GitSyncControls/BranchDropdown";

type CreateWorktreeModalProps = {
  opened: boolean;
  isCreating: boolean;
  onClose: () => void;
  onCreate: (branch: string) => void;
};

export function CreateWorktreeModal({
  opened,
  isCreating,
  onClose,
  onCreate,
}: CreateWorktreeModalProps) {
  return (
    <Modal opened={opened} title={t`Check out a branch`} onClose={onClose}>
      {opened && (
        <CreateWorktreeModalBody isCreating={isCreating} onCreate={onCreate} />
      )}
    </Modal>
  );
}

type CreateWorktreeModalBodyProps = Omit<
  CreateWorktreeModalProps,
  "opened" | "onClose"
>;

function CreateWorktreeModalBody({
  isCreating,
  onCreate,
}: CreateWorktreeModalBodyProps) {
  const combobox = useCombobox();
  const [branch, setBranch] = useState("");

  return (
    <Stack gap="md">
      <Text c="text-secondary" size="sm">
        {t`The branch is checked out as a separate collection tree. Pick an existing branch, or type a new name to create one.`}
      </Text>
      <Combobox store={combobox} position="bottom-start" withinPortal>
        <Combobox.Target>
          <Button
            variant="default"
            disabled={isCreating}
            onClick={() => combobox.toggleDropdown()}
            leftSection={<Icon name="git_branch" size={14} />}
            rightSection={<Icon name="chevrondown" size={10} />}
            styles={{
              inner: { justifyContent: "flex-start" },
              label: { marginInlineEnd: "auto" },
            }}
          >
            {branch || t`Select a branch`}
          </Button>
        </Combobox.Target>
        <BranchDropdown
          combobox={combobox}
          value={branch}
          onChange={setBranch}
        />
      </Combobox>
      <Button
        disabled={branch.length === 0}
        loading={isCreating}
        variant="filled"
        onClick={() => onCreate(branch)}
      >
        {t`Check out`}
      </Button>
    </Stack>
  );
}
