import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { Badge } from "metabase/common/components/Badge";
import { useUserSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import {
  ActionIcon,
  Box,
  Combobox,
  Divider,
  Group,
  Icon,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
  useCombobox,
} from "metabase/ui";
import {
  useCreateGitBranchMutation,
  useDeleteGitBranchMutation,
  useListGitBranchesQuery,
} from "metabase-enterprise/api/git-sync";
import type { GitBranch } from "metabase-types/api";

interface SelectBranchProps {
  disabled?: boolean;
}

export const SelectBranch = ({ disabled = false }: SelectBranchProps) => {
  const [currentBranch, setCurrentBranch] = useUserSetting("git-branch", {
    shouldDebounce: false,
  });
  const [searchValue, setSearchValue] = useState("");
  const currentUser = useSelector(getCurrentUser);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: branches = [], isLoading } = useListGitBranchesQuery();

  const defaultBranch = branches.find((b) => !b.parent_branch_id);
  const displayBranch = currentBranch || defaultBranch?.name;
  const [createBranch, { isLoading: isCreatingBranch }] =
    useCreateGitBranchMutation();
  const [deleteBranch, { isLoading: isDeletingBranch }] =
    useDeleteGitBranchMutation();

  const filteredBranches = useMemo(() => {
    const availableBranches = branches.filter(
      (branch) => branch.name !== displayBranch,
    );

    if (!searchValue) {
      return availableBranches;
    }
    const search = searchValue.toLowerCase();
    return availableBranches.filter((branch) =>
      branch.name.toLowerCase().includes(search),
    );
  }, [branches, searchValue, displayBranch]);

  const isExactMatch = useMemo(
    () =>
      filteredBranches.some(
        (b) => b.name.toLowerCase() === searchValue.toLowerCase(),
      ),
    [filteredBranches, searchValue],
  );

  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearchValue("");
    },
    onDropdownOpen: () => {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    },
  });

  const handleBranchSelect = useCallback(
    (branch: GitBranch) => {
      if (branch.name === displayBranch) {
        combobox.closeDropdown();
        return;
      }

      setCurrentBranch(branch.name);
      combobox.closeDropdown();
      setSearchValue("");

      // Force page reload to clear all cached data
      window.location.reload();
    },
    [displayBranch, setCurrentBranch, combobox],
  );

  const handleCreateAndSwitch = useCallback(
    async (branchName: string) => {
      try {
        const currentBranchObj = branches.find((b) => b.name === displayBranch);
        const result = await createBranch({
          name: branchName.trim(),
          parent_branch_id: currentBranchObj?.id,
        }).unwrap();

        handleBranchSelect(result);
      } catch (error) {
        console.error("Failed to create branch:", error);
      }
    },
    [createBranch, displayBranch, handleBranchSelect, branches],
  );

  const handleDeleteBranch = useCallback(
    async (event: React.MouseEvent, branch: GitBranch) => {
      event.stopPropagation();

      if (branch.name === displayBranch) {
        const defaultBranch = branches.find((b) => !b.parent_branch_id);
        if (defaultBranch) {
          setCurrentBranch(defaultBranch.name);
        }
      }

      try {
        await deleteBranch(branch.id).unwrap();
      } catch (error) {
        console.error("Failed to delete branch:", error);
      }
    },
    [deleteBranch, displayBranch, branches, setCurrentBranch],
  );

  return (
    <Combobox store={combobox} withinPortal position="bottom-end">
      <Combobox.Target>
        <UnstyledButton
          onClick={() => combobox.toggleDropdown()}
          disabled={disabled || isCreatingBranch}
          style={{ minWidth: 0 }}
        >
          <Badge
            icon={{ name: "git_branch", size: 14 }}
            activeColor="text-white"
            inactiveColor="text-white"
            isSingleLine
          >
            {displayBranch}
            {(isLoading || isCreatingBranch || isDeletingBranch) && (
              <Loader size="xs" ml="xs" />
            )}
          </Badge>
        </UnstyledButton>
      </Combobox.Target>

      <Combobox.Dropdown style={{ minWidth: 320 }}>
        <Combobox.EventsTarget>
          <Stack gap={0}>
            <Box p="sm">
              <TextInput
                ref={inputRef}
                placeholder={t`Find or create branch`}
                value={searchValue}
                onChange={(e) => setSearchValue(e.currentTarget.value)}
                autoFocus
              />
            </Box>

            {(filteredBranches.length > 0 || searchValue) && <Divider />}

            <ScrollArea.Autosize mah={300}>
              <Stack gap={0} p="sm">
                {defaultBranch && filteredBranches.includes(defaultBranch) && (
                  <>
                    <Combobox.Option
                      value={defaultBranch.name}
                      onClick={() => handleBranchSelect(defaultBranch)}
                      py="xs"
                    >
                      <Group justify="space-between" w="100%">
                        <Text>{defaultBranch.name}</Text>
                      </Group>
                    </Combobox.Option>
                    {filteredBranches.filter((b) => b !== defaultBranch)
                      .length > 0 && <Divider my="xs" />}
                  </>
                )}

                {filteredBranches
                  .filter((b) => b !== defaultBranch)
                  .map((branch) => {
                    const isAuthor = currentUser?.id === branch.creator_id;
                    const canDelete = isAuthor && branch.name !== displayBranch;

                    return (
                      <Combobox.Option
                        key={branch.id}
                        value={branch.name}
                        onClick={() => handleBranchSelect(branch)}
                        py="xs"
                      >
                        <Group justify="space-between" w="100%">
                          <Text>{branch.name}</Text>
                          {canDelete && (
                            <Tooltip label={t`Delete branch`}>
                              <ActionIcon
                                size="xs"
                                variant="subtle"
                                color="red"
                                onClick={(e) => handleDeleteBranch(e, branch)}
                                disabled={isDeletingBranch}
                              >
                                <Icon name="close" size={12} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      </Combobox.Option>
                    );
                  })}

                {searchValue && !isExactMatch && (
                  <Combobox.Option
                    value="create-new"
                    onClick={() => handleCreateAndSwitch(searchValue)}
                    disabled={isCreatingBranch}
                    py="xs"
                  >
                    <Text c="brand">{t`Create "${searchValue}"`}</Text>
                  </Combobox.Option>
                )}

                {!searchValue && filteredBranches.length === 0 && (
                  <Box p="sm">
                    <Text size="md" c="text-medium" ta="center">
                      {branches.length === 0
                        ? t`Type a name to create your first branch`
                        : t`No branches found`}
                    </Text>
                  </Box>
                )}
              </Stack>
            </ScrollArea.Autosize>
          </Stack>
        </Combobox.EventsTarget>
      </Combobox.Dropdown>
    </Combobox>
  );
};
