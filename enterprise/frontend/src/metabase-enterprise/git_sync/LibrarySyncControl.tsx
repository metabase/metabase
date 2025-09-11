import { useRef, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import ActionButton from "metabase/common/components/ActionButton";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useSetting } from "metabase/common/hooks";
import {
  Alert,
  Anchor,
  Autocomplete,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Popover,
  Stack,
  Text,
} from "metabase/ui";
import {
  useExportGitMutation,
  useGetUnsyncedChangesQuery,
  useImportGitMutation,
} from "metabase-enterprise/api";

import { UnsyncedChangesModal } from "./UnsyncedChangesModal";

const SAMPLE_BRANCHES = [
  "main",
  "development",
  "feature/add-user-authentication",
  "bugfix/fix-login-issue",
  "release/v1.2.0",
  "hotfix/critical-security-patch",
  "feature/improve-dashboard-ui",
  "chore/update-dependencies",
  "refactor/code-cleanup",
  "test/add-unit-tests",
];

export function LibrarySyncControl() {
  const [importGit, { isLoading: isImporting }] = useImportGitMutation();
  const [exportGit, { isLoading: isExporting }] = useExportGitMutation();
  const [showImportConfirmation, setShowImportConfirmation] = useState(false);
  const [showUnsyncedChangesModal, setShowUnsyncedChangesModal] =
    useState(false);
  const importButtonRef = useRef<{ cancel: () => void } | null>(null);
  const promiseRef = useRef<{
    resolve: (value?: unknown | PromiseLike<unknown>) => void;
    reject: (reason?: any) => void;
  } | null>(null);

  const defaultPullBranch = useSetting("git-sync-import-branch");
  const defaultPushBranch = useSetting("git-sync-export-branch");
  const allowEdit = useSetting("git-sync-allow-edit");
  const gitSyncConfigured = useSetting("git-sync-configured");

  const {
    data: unsyncedChanges,
    isLoading: isCheckingUnsynced,
    refetch: refetchUnsyncedChanges,
  } = useGetUnsyncedChangesQuery(undefined, {
    skip: !gitSyncConfigured,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const hasUnsyncedChanges =
    unsyncedChanges?.has_unsynced_changes &&
    (unsyncedChanges?.unsynced_counts?.total ?? 0) > 0;

  const isLoading = isImporting || isExporting || isCheckingUnsynced;

  const handleImportClick = async () => {
    if (hasUnsyncedChanges) {
      setShowImportConfirmation(true);
      return new Promise((resolve, reject) => {
        promiseRef.current = { resolve, reject };
      });
    } else {
      return importGit({}).unwrap();
    }
  };

  const handleConfirmImport = async () => {
    try {
      setShowImportConfirmation(false);
      const result = await importGit({}).unwrap();
      promiseRef.current?.resolve(result);
    } catch (error) {
      promiseRef.current?.reject(error);
      throw error;
    } finally {
      promiseRef.current = null;
    }
  };

  const handleCancelImport = () => {
    setShowImportConfirmation(false);
    importButtonRef.current?.cancel();
    promiseRef.current = null;
  };

  const handlePopoverOpenChange = (opened: boolean) => {
    if (opened && gitSyncConfigured) {
      refetchUnsyncedChanges();
    }
  };

  return (
    <>
      <Popover
        closeOnClickOutside={false}
        onOpenChange={handlePopoverOpenChange}
      >
        <Popover.Target>
          <Button variant="subtle" leftSection={<Icon name="sync" />} />
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="md" align="stretch" p="lg">
            {hasUnsyncedChanges && (
              <Alert
                variant="error"
                icon={<Icon name="warning" />}
                title={t`Unsynced changes detected`}
              >
                <Stack gap="sm">
                  <Text>
                    {t`You have ${unsyncedChanges?.unsynced_counts?.total} unsynced changes. Importing will overwrite these changes.`}
                  </Text>
                  {unsyncedChanges?.entities && (
                    <Anchor
                      onClick={() => setShowUnsyncedChangesModal(true)}
                      c="text"
                      size="sm"
                      style={{ cursor: "pointer" }}
                    >
                      {t`View affected items`}
                    </Anchor>
                  )}
                </Stack>
              </Alert>
            )}
            <Flex gap="md" align="end">
              <Autocomplete
                name="git-sync-import-branch"
                // eslint-disable-next-line
                description={t`Metabase will pull in all content from this branch`}
                title={t`Import branch`}
                defaultValue={defaultPullBranch ?? "main"}
                w="20rem"
                data={SAMPLE_BRANCHES}
              />
              <ActionButton
                ref={importButtonRef}
                primary
                actionFn={handleImportClick}
                variant="filled"
                failedText={t`Sync failed`}
                activeText={t`Syncing...`}
                successText={t`Synced`}
                useLoadingSpinner
                disabled={isLoading}
              >
                <Group align="center" gap="sm">
                  <Icon name="download" />
                  {t`Import`}
                </Group>
              </ActionButton>
            </Flex>
            {allowEdit && (
              <Flex gap="md" align="end">
                <Autocomplete
                  name="git-sync-export-branch"
                  // eslint-disable-next-line
                  description={t`Metabase will push all content to this branch`}
                  title={t`Export branch`}
                  defaultValue={defaultPushBranch ?? "main"}
                  w="20rem"
                  data={SAMPLE_BRANCHES}
                />
                <ActionButton
                  primary
                  actionFn={() => exportGit({}).unwrap()}
                  variant="filled"
                  failedText={t`Sync failed`}
                  activeText={t`Syncing...`}
                  successText={t`Synced`}
                  useLoadingSpinner
                  disabled={isLoading}
                >
                  <Group align="center" gap="sm">
                    <Icon name="upload" />
                    {t`Export`}
                  </Group>
                </ActionButton>
              </Flex>
            )}
            <Box>
              <Link to="/admin/settings/library/sync">
                <Text c="brand" component="span">
                  {t`Configure sync settings.`}
                </Text>
              </Link>
            </Box>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      <ConfirmModal
        opened={showImportConfirmation}
        onClose={handleCancelImport}
        title={t`Confirm Import`}
        content={t`This will overwrite ${unsyncedChanges?.unsynced_counts?.total} unsynced changes in your Library.`}
        message={t`This action cannot be undone. Are you sure you want to continue?`}
        onConfirm={handleConfirmImport}
        confirmButtonText={t`Import and overwrite`}
        closeButtonText={t`Cancel`}
      />

      {unsyncedChanges?.entities && (
        <UnsyncedChangesModal
          opened={showUnsyncedChangesModal}
          onClose={() => setShowUnsyncedChangesModal(false)}
          entities={unsyncedChanges.entities}
          totalCount={unsyncedChanges?.unsynced_counts?.total ?? 0}
        />
      )}
    </>
  );
}
