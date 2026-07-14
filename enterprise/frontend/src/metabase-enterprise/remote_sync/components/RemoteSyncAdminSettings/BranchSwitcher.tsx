import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Button,
  Combobox,
  Group,
  Icon,
  Modal,
  Text,
  useCombobox,
} from "metabase/ui";
import {
  useImportChangesMutation,
  useLazyGetRemoteSyncChangesQuery,
} from "metabase-enterprise/api/remote-sync";
import type { RemoteSyncEntity } from "metabase-types/api";

import { trackBranchSwitched } from "../../analytics";
import { type SyncError, parseSyncError } from "../../utils";
import { BranchDropdown } from "../GitSyncControls/BranchDropdown";
import { SyncConflictModal } from "../SyncConflictModal";

interface BranchSwitcherProps {
  /** May be undefined for non-admins, who can't read the admin-visibility branch setting. */
  currentBranch?: string | null;
  /** Un-pushed local changes; when present, switching prompts the admin to choose what to do with them. */
  dirty: RemoteSyncEntity[];
  disabled?: boolean;
  /** Name of the env var pinning the branch (e.g. "MB_REMOTE_SYNC_BRANCH"), when set; shows a "Using …" note. */
  envVarName?: string | null;
}

/**
 * Read-write branch switching, surfaced only in the instance Settings panel. When the instance is clean
 * the switch runs directly — everything is already pushed, so it is reversible. When there are
 * unsaved changes, the admin is offered a choice (push them, stash to a new branch, or discard and switch)
 * rather than a silent overwrite. Creating a new branch forks the current one (no reconcile), so it is
 * allowed even with unsaved changes — it is the safe way to keep local work.
 */
export const BranchSwitcher = ({
  currentBranch,
  dirty,
  disabled,
  envVarName,
}: BranchSwitcherProps) => {
  const combobox = useCombobox();
  const [sendToast] = useToast();
  const [importChanges, { isLoading }] = useImportChangesMutation();
  const [fetchDirty] = useLazyGetRemoteSyncChangesQuery();
  // Switching goes through superuser-only endpoints, so only admins get the control.
  const isAdmin = useSelector(getUserIsAdmin);
  // Set to the target branch when there are unsaved changes, opening the choose-what-to-do modal.
  const [pendingBranch, setPendingBranch] = useState<string | null>(null);
  const [branchMismatch, setBranchMismatch] = useState<string | null>(null);

  // Switching is admin-only; show the section with a message rather than a control they can't use.
  if (!isAdmin) {
    return (
      <Text c="text-secondary" size="sm">
        {t`You need to be an admin to switch the sync branch.`}
      </Text>
    );
  }
  // Admins can read the branch setting; guard anyway so the rest can treat it as a definite string.
  if (!currentBranch) {
    return null;
  }

  const performSwitch = async (branch: string) => {
    try {
      // force is left false so the backend surfaces deletion conflicts rather than silently discarding
      // local-only content.
      await importChanges({
        branch,
        expected_branch: currentBranch,
      }).unwrap();
      trackBranchSwitched({ triggeredFrom: "admin-settings" });
    } catch (error) {
      const { hasBranchMismatch, errorMessage } = parseSyncError(
        // Unjustified type cast. FIXME
        error as SyncError,
      );
      if (hasBranchMismatch) {
        setBranchMismatch(
          errorMessage ?? t`The sync branch changed in another session.`,
        );
        return;
      }
      sendToast({
        icon: "warning",
        toastColor: "feedback-negative",
        message: errorMessage ?? t`Sorry, we were unable to switch branches.`,
      });
    }
  };

  const handleSelect = async (branch: string, isNewBranch?: boolean) => {
    if (branch === currentBranch) {
      return;
    }
    // Creating a branch forks the current one server-side (identical content, already switched to), so no
    // reconcile runs and unsaved changes are preserved on the new branch. The branch picker already
    // reports the creation, so don't also report a switch.
    if (isNewBranch) {
      return;
    }
    // Refetch the dirty state at switch time so a stale snapshot (e.g. content edited since the settings
    // page loaded) doesn't send us down the wrong path. Fall back to the last-known state on error.
    let hasUnsavedChanges = dirty.length > 0;
    try {
      const fresh = await fetchDirty().unwrap();
      hasUnsavedChanges = fresh.dirty.length > 0;
    } catch {
      // keep hasUnsavedChanges as the last-known value
    }
    // With unsaved changes, let the admin choose what to do with them (push / stash / discard) instead of
    // silently discarding.
    if (hasUnsavedChanges) {
      setPendingBranch(branch);
      return;
    }
    // Clean instance: everything is already pushed, so the switch is reversible (content missing from the
    // target still lives on the remote and returns when you switch back). No confirmation needed.
    performSwitch(branch);
  };

  const dirtyCount = dirty.length;

  return (
    <>
      <Group gap="md" align="center">
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
              // Pack contents to the start (branch name next to the icon, like a standard select)
              // and let the label's auto end-margin push the chevron to the right edge.
              styles={{
                inner: { justifyContent: "flex-start" },
                label: { marginInlineEnd: "auto" },
              }}
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
        {dirtyCount > 0 && (
          <Text
            c="feedback-negative"
            size="sm"
            data-testid="branch-switcher-dirty-warning"
          >
            {ngettext(
              msgid`${dirtyCount} unsaved change`,
              `${dirtyCount} unsaved changes`,
              dirtyCount,
            )}
          </Text>
        )}
      </Group>

      {envVarName && (
        <Text c="text-secondary" size="sm" mt="sm">
          {t`Using ${envVarName}`}
        </Text>
      )}

      {pendingBranch && (
        <SyncConflictModal
          variant="switch-branch"
          currentBranch={currentBranch}
          nextBranch={pendingBranch}
          onClose={() => setPendingBranch(null)}
        />
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
