import { useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { refreshCurrentUser } from "metabase/redux/user";
import { getUser } from "metabase/selectors/user";
import {
  Button,
  Combobox,
  Icon,
  Modal,
  Stack,
  Text,
  useCombobox,
} from "metabase/ui";
import {
  useCheckoutBranchMutation,
  useImportChangesMutation,
} from "metabase-enterprise/api";

import { BranchDropdown } from "../GitSyncControls/BranchDropdown";

interface CheckoutBranchModalProps {
  opened: boolean;
  onClose: () => void;
}

/**
 * Per-user branch checkout: pick an existing git branch (or create a new one)
 * and start working on it. Checking out an existing branch pulls it; a freshly
 * created branch is materialized locally from the branch you were on, so there
 * is nothing to pull yet.
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
  const [checkoutBranch, { isLoading: isCheckingOut }] =
    useCheckoutBranchMutation();
  const [importChanges, { isLoading: isPulling }] = useImportChangesMutation();
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = async (branch: string, isNewBranch?: boolean) => {
    setSelected(branch);
    try {
      await checkoutBranch({ branch }).unwrap();
      if (!isNewBranch) {
        await importChanges({ branch }).unwrap();
      }
      await dispatch(refreshCurrentUser());
      sendToast({ message: t`Checked out ${branch}` });
      onClose();
    } catch (error) {
      console.error(error);
      sendToast({
        icon: "warning",
        toastColor: "feedback-negative",
        message: t`Sorry, we were unable to check out ${branch}.`,
      });
    } finally {
      setSelected(null);
    }
  };

  const handleLeave = async () => {
    try {
      await checkoutBranch({ branch: null }).unwrap();
      await dispatch(refreshCurrentUser());
      sendToast({ message: t`Back on the main sync branch` });
      onClose();
    } catch {
      sendToast({
        icon: "warning",
        toastColor: "feedback-negative",
        message: t`Sorry, we were unable to switch back.`,
      });
    }
  };

  const isBusy = isCheckingOut || isPulling;

  return (
    <Modal opened={opened} onClose={onClose} title={t`Checkout branch`}>
      <Stack gap="md">
        <Text c="text-secondary" size="sm">
          {t`Work on a git branch of your own: pick an existing branch to pull it, or create a new one from the branch you're on.`}
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
              disabled={isBusy}
              loading={isBusy}
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
            onChange={handleSelect}
            value={currentBranch ?? ""}
          />
        </Combobox>
        {currentBranch != null && (
          <Button variant="subtle" onClick={handleLeave} disabled={isBusy}>
            {t`Back to the main branch`}
          </Button>
        )}
      </Stack>
    </Modal>
  );
};
