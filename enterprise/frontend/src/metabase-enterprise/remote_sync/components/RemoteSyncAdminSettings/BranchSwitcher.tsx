import { useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import {
  Box,
  Button,
  Combobox,
  Group,
  Icon,
  List,
  Modal,
  Stack,
  Text,
  useCombobox,
} from "metabase/ui";
import { useImportChangesMutation } from "metabase-enterprise/api/remote-sync";
import type { RemoteSyncEntity } from "metabase-types/api";

import { trackBranchSwitched } from "../../analytics";
import { type SyncError, parseSyncError } from "../../utils";
import { BranchDropdown } from "../GitSyncControls/BranchDropdown";

interface BranchSwitcherProps {
  currentBranch: string;
  /** Un-pushed local changes; when present, switching to an existing branch is blocked. */
  dirty: RemoteSyncEntity[];
  disabled?: boolean;
}

/**
 * Read-write branch switching, surfaced only in the instance Settings panel behind destructive-action
 * guard rails (GHY-4019): a switch is hard-blocked while there are unsaved changes, and otherwise requires
 * an explicit destructive confirmation. Creating a new branch forks the current one (no reconcile), so it
 * is allowed even with unsaved changes — it is the safe way to keep local work.
 */
export const BranchSwitcher = ({
  currentBranch,
  dirty,
  disabled,
}: BranchSwitcherProps) => {
  const combobox = useCombobox();
  const [sendToast] = useToast();
  const [importChanges, { isLoading }] = useImportChangesMutation();
  const { show: showConfirm, modalContent: confirmModal } = useConfirmation();
  const [blockedChanges, setBlockedChanges] = useState<
    RemoteSyncEntity[] | null
  >(null);
  const [branchMismatch, setBranchMismatch] = useState<string | null>(null);

  const performSwitch = async (branch: string) => {
    try {
      // force is left false so the backend hard-blocks on unsaved changes and surfaces deletion conflicts
      // rather than silently discarding local-only content.
      await importChanges({
        branch,
        expected_branch: currentBranch,
      }).unwrap();
      trackBranchSwitched({ triggeredFrom: "admin-settings" });
    } catch (error) {
      const { hasBranchMismatch, hasConflict, errorMessage } = parseSyncError(
        error as SyncError,
      );
      if (hasBranchMismatch) {
        setBranchMismatch(
          errorMessage ?? t`The sync branch changed in another session.`,
        );
        return;
      }
      // A conflict here means the instance became dirty between the guard check and the request.
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: hasConflict
          ? (errorMessage ??
            t`You have unsaved changes. Push or discard them before switching branches.`)
          : (errorMessage ?? t`Sorry, we were unable to switch branches.`),
      });
    }
  };

  const handleSelect = (branch: string, isNewBranch?: boolean) => {
    if (branch === currentBranch) {
      return;
    }
    // Creating a branch forks the current one server-side (identical content, already switched to), so no
    // reconcile runs and unsaved changes are preserved on the new branch.
    if (isNewBranch) {
      trackBranchSwitched({ triggeredFrom: "admin-settings" });
      return;
    }
    if (dirty.length > 0) {
      setBlockedChanges(dirty);
      return;
    }
    showConfirm({
      title: t`Switch branches?`,
      message: t`Switching to “${branch}” reconciles your synced collections to that branch. Content that only exists locally can be permanently deleted — even if you switch back. Do this rarely, and only when you understand the consequences.`,
      confirmButtonText: t`Switch branch`,
      confirmButtonProps: { variant: "filled", color: "danger" },
      onConfirm: () => performSwitch(branch),
    });
  };

  return (
    <>
      <Combobox
        store={combobox}
        position="bottom-start"
        width={320}
        withinPortal
      >
        <Combobox.Target>
          <Button
            variant="default"
            disabled={disabled || isLoading}
            loading={isLoading}
            onClick={() => combobox.toggleDropdown()}
            leftSection={<Icon name="git_branch" size={14} />}
            rightSection={<Icon name="chevrondown" size={10} />}
            data-testid="settings-branch-switcher"
            w="20rem"
            styles={{ inner: { justifyContent: "space-between" } }}
          >
            {currentBranch}
          </Button>
        </Combobox.Target>
        <BranchDropdown
          baseBranch={currentBranch}
          combobox={combobox}
          onChange={handleSelect}
          value={currentBranch}
        />
      </Combobox>

      {confirmModal}

      {blockedChanges && (
        <Modal
          opened
          padding="xl"
          title={t`Can't switch branches`}
          onClose={() => setBlockedChanges(null)}
        >
          <Stack gap="md" pt="sm">
            <Text>
              {t`You have unsaved changes in synced collections. Push or discard them before switching branches, or they may be lost.`}
            </Text>
            <Box>
              <Text fw="bold" mb="xs">{t`Unsaved changes:`}</Text>
              <List>
                {blockedChanges.map((entity) => (
                  <List.Item key={`${entity.model}-${entity.id}`}>
                    {entity.name}{" "}
                    <Text component="span" c="text-secondary">
                      ({entity.model})
                    </Text>
                  </List.Item>
                ))}
              </List>
            </Box>
            <Group justify="end">
              <Button
                variant="filled"
                onClick={() => setBlockedChanges(null)}
              >
                {t`Got it`}
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}

      {branchMismatch && (
        <Modal
          opened
          padding="xl"
          title={t`This view is out of date`}
          withCloseButton={false}
          onClose={() => setBranchMismatch(null)}
        >
          <Text mt="md">{branchMismatch}</Text>
          <Group gap="sm" justify="end" mt="xl">
            <Button variant="subtle" onClick={() => setBranchMismatch(null)}>
              {t`Cancel`}
            </Button>
            <Button variant="filled" onClick={() => window.location.reload()}>
              {t`Refresh`}
            </Button>
          </Group>
        </Modal>
      )}
    </>
  );
};
