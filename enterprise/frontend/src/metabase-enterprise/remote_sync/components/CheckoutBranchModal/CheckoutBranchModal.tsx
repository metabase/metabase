import { useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { refreshCurrentUser } from "metabase/redux/user";
import { getUser } from "metabase/selectors/user";
import {
  Button,
  Combobox,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
  useCombobox,
} from "metabase/ui";
import { useCheckoutBranchMutation } from "metabase-enterprise/api";

import { BranchDropdown } from "../GitSyncControls/BranchDropdown";

interface CheckoutBranchModalProps {
  opened: boolean;
  onClose: () => void;
}

/**
 * Per-user branch checkout: pick an existing git branch (or create a new one)
 * and confirm to start working on it. The switch itself is immediate — content
 * is not pulled automatically; use "Pull changes" afterwards to fetch the
 * branch's latest state.
 */
export const CheckoutBranchModal = ({
  opened,
  onClose,
}: CheckoutBranchModalProps) => {
  const combobox = useCombobox();
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const currentUser = useSelector(getUser);
  const currentBranch = currentUser?.branch ?? null;
  const [checkoutBranch, { isLoading }] = useCheckoutBranchMutation();
  const [selected, setSelected] = useState<string | null>(null);

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  const switchTo = async (branch: string | null) => {
    try {
      await checkoutBranch({ branch }).unwrap();
      await dispatch(refreshCurrentUser());
      sendToast({
        message: branch
          ? t`Switched to ${branch}`
          : t`Back on the main sync branch`,
      });
      handleClose();
    } catch {
      sendToast({
        icon: "warning",
        toastColor: "feedback-negative",
        message: t`Sorry, we were unable to switch branches.`,
      });
    }
  };

  const canConfirm =
    selected != null && selected !== currentBranch && !isLoading;

  return (
    <Modal opened={opened} onClose={handleClose} title={t`Checkout branch`}>
      <Stack gap="md">
        <Text c="text-secondary" size="sm">
          {currentBranch
            ? t`You are working on ${currentBranch}.`
            : t`You are working on the main sync branch.`}{" "}
          {t`Pick an existing branch or create a new one from the branch you're on.`}
        </Text>
        <Combobox
          store={combobox}
          position="bottom-start"
          width={320}
          withinPortal
        >
          <Combobox.Target>
            <Button
              variant="default"
              disabled={isLoading}
              onClick={() => combobox.toggleDropdown()}
              leftSection={<Icon name="git_branch" size={14} />}
              rightSection={<Icon name="chevrondown" size={10} />}
              styles={{
                inner: { justifyContent: "flex-start" },
                label: { marginInlineEnd: "auto" },
              }}
            >
              {selected ?? currentBranch ?? t`Select a branch`}
            </Button>
          </Combobox.Target>
          <BranchDropdown
            baseBranch={currentBranch ?? "main"}
            combobox={combobox}
            onChange={(branch) => setSelected(branch)}
            value={selected ?? currentBranch ?? ""}
          />
        </Combobox>
        <Group justify="space-between">
          {currentBranch != null ? (
            <Button
              variant="subtle"
              onClick={() => switchTo(null)}
              disabled={isLoading}
            >
              {t`Back to the main branch`}
            </Button>
          ) : (
            <span />
          )}
          <Group gap="sm">
            <Button variant="default" onClick={handleClose}>
              {t`Cancel`}
            </Button>
            <Button
              variant="filled"
              disabled={!canConfirm}
              loading={isLoading}
              onClick={() => selected && switchTo(selected)}
            >
              {t`Switch branch`}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};
