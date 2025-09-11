import { Link } from "react-router";
import { t } from "ttag";

import ActionButton from "metabase/common/components/ActionButton";
import { useSetting } from "metabase/common/hooks";
import {
  Alert,
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

  const defaultPullBranch = useSetting("git-sync-import-branch");
  const defaultPushBranch = useSetting("git-sync-export-branch");
  const allowEdit = useSetting("git-sync-allow-edit");
  const gitSyncConfigured = useSetting("git-sync-configured");

  const { data: unsyncedChanges, isLoading: isCheckingUnsynced } =
    useGetUnsyncedChangesQuery(undefined, {
      skip: !gitSyncConfigured,
    });

  const hasUnsyncedChanges =
    unsyncedChanges?.has_unsynced_changes &&
    (unsyncedChanges?.unsynced_counts?.total ?? 0) > 0;

  const isLoading = isImporting || isExporting || isCheckingUnsynced;

  return (
    <Popover closeOnClickOutside={false}>
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
              {t`You have ${unsyncedChanges?.unsynced_counts?.total} unsynced changes. Importing will overwrite these changes.`}
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
              primary
              actionFn={() => importGit({}).unwrap()}
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
  );
}
