import cx from "classnames";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { trackContentStudioScopeChanged } from "metabase/common/content-studio/analytics";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import {
  Box,
  Button,
  Combobox,
  Divider,
  Flex,
  Group,
  Icon,
  Loader,
  ScrollArea,
  Text,
  TextInput,
  Tooltip,
  useCombobox,
} from "metabase/ui";
import { useWorktrees } from "metabase-enterprise/remote_sync/hooks/use-worktrees";
import { getIsRunning } from "metabase-enterprise/remote_sync/selectors";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

import { useContentStudioScope } from "../../scope";

import S from "./BranchSelector.module.css";

const MAIN_VALUE = "main";
const CHECK_OUT_VALUE = "check-out-branch";

export type BranchSelectorProps = {
  onCheckOutBranch?: () => void;
  /** Actions on the selected branch, shown next to the selector. */
  branchActions?: ReactNode;
};

type BranchEntry = {
  worktreeId: RemoteSyncWorktreeId | null;
  label: string;
};

function getEntryValue({ worktreeId }: BranchEntry) {
  return worktreeId == null ? MAIN_VALUE : String(worktreeId);
}

export function BranchSelector({
  onCheckOutBranch,
  branchActions,
}: BranchSelectorProps) {
  const { worktreeId, setScope } = useContentStudioScope();
  const { worktrees, isEnabled, isFetching } = useWorktrees();
  const mainBranch = useSetting("remote-sync-branch");
  const isSyncRunning = useSelector(getIsRunning);
  const combobox = useCombobox();
  const [searchValue, setSearchValue] = useState("");

  const mainLabel = mainBranch ? t`Main (${mainBranch})` : t`Main`;

  const entries = useMemo<BranchEntry[]>(
    () => [
      { worktreeId: null, label: mainLabel },
      ...[...worktrees]
        .sort((a, b) => a.branch.localeCompare(b.branch))
        .map((worktree) => ({
          worktreeId: worktree.id,
          label: worktree.branch,
        })),
    ],
    [mainLabel, worktrees],
  );

  const filteredEntries = useMemo(() => {
    const search = searchValue.trim().toLowerCase();
    return search
      ? entries.filter((entry) => entry.label.toLowerCase().includes(search))
      : entries;
  }, [entries, searchValue]);

  useEffect(() => {
    if (!combobox.dropdownOpened) {
      setSearchValue("");
    }
  }, [combobox.dropdownOpened]);

  const selectedWorktree =
    worktrees.find((worktree) => worktree.id === worktreeId) ?? null;
  const selectedLabel = selectedWorktree?.branch ?? mainLabel;
  const isLoading = isFetching || isSyncRunning;

  if (!isEnabled) {
    return null;
  }

  const handleOptionSubmit = (value: string) => {
    combobox.closeDropdown();

    if (value === CHECK_OUT_VALUE) {
      onCheckOutBranch?.();
      return;
    }

    const entry = entries.find(
      (candidate) => getEntryValue(candidate) === value,
    );

    if (entry) {
      if (entry.worktreeId !== worktreeId) {
        trackContentStudioScopeChanged(entry.worktreeId);
      }
      setScope(entry.worktreeId);
    }
  };

  return (
    <Flex align="center" gap="xs">
      <Tooltip
        label={t`A sync is already in progress`}
        disabled={!isSyncRunning}
      >
        <Box flex={1} miw={0} data-testid="content-studio-branch-selector">
          <Combobox
            store={combobox}
            position="bottom-start"
            width={280}
            withinPortal
            disabled={isSyncRunning}
            onOptionSubmit={handleOptionSubmit}
          >
            <Combobox.Target>
              <Button
                p="sm"
                size="compact-sm"
                bd="none"
                maw="100%"
                disabled={isSyncRunning}
                aria-label={t`Branch: ${selectedLabel}`}
                onClick={() => combobox.toggleDropdown()}
                leftSection={
                  <Icon name="git_branch" c="text-secondary" size={14} />
                }
                rightSection={
                  isLoading ? (
                    <Loader size="xs" />
                  ) : (
                    <Icon
                      name="chevrondown"
                      c="text-secondary"
                      size={8}
                      className={cx(S.chevronIcon, {
                        [S.opened]: combobox.dropdownOpened,
                      })}
                    />
                  )
                }
              >
                <Text fw="bold" c="text-secondary" size="sm" lh="md" truncate>
                  {selectedLabel}
                </Text>
              </Button>
            </Combobox.Target>

            <Combobox.Dropdown p={0}>
              <Box p="sm">
                <Combobox.EventsTarget>
                  <TextInput
                    autoFocus
                    aria-label={t`Find a branch`}
                    leftSection={<Icon name="search" size={16} />}
                    placeholder={t`Find a branch…`}
                    value={searchValue}
                    onChange={(event) => {
                      setSearchValue(event.currentTarget.value);
                      combobox.resetSelectedOption();
                    }}
                  />
                </Combobox.EventsTarget>
              </Box>

              <Divider />

              <Combobox.Options aria-label={t`Branches`}>
                <ScrollArea.Autosize mah={320} type="hover">
                  {filteredEntries.length === 0 ? (
                    <Box p="md">
                      <Text size="sm" c="text-disabled" ta="center">
                        {t`No branches found`}
                      </Text>
                    </Box>
                  ) : (
                    filteredEntries.map((entry) => (
                      <Combobox.Option
                        key={getEntryValue(entry)}
                        value={getEntryValue(entry)}
                        py="sm"
                      >
                        <Group gap="xs" wrap="nowrap" justify="space-between">
                          <Text>{entry.label}</Text>
                          {entry.worktreeId === worktreeId && (
                            <Icon name="check" size={12} />
                          )}
                        </Group>
                      </Combobox.Option>
                    ))
                  )}
                </ScrollArea.Autosize>

                <Divider />

                <Box p="sm">
                  <Combobox.Option value={CHECK_OUT_VALUE} py="sm">
                    <Group gap="xs" wrap="nowrap">
                      <Icon name="add" size={16} />
                      <Text>{t`Check out a branch…`}</Text>
                    </Group>
                  </Combobox.Option>
                </Box>
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
        </Box>
      </Tooltip>
      {selectedWorktree != null && branchActions}
    </Flex>
  );
}
