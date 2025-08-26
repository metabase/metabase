import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useUserSetting } from "metabase/common/hooks";
import {
  Box,
  Combobox,
  Divider,
  Icon,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  useCombobox,
} from "metabase/ui";
import {
  useCreateGitBranchMutation,
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

  const displayBranch = currentBranch || "main";

  const { data: branches = [], isLoading } = useListGitBranchesQuery();
  const [createBranch, { isLoading: isCreatingBranch }] =
    useCreateGitBranchMutation();

  const filteredBranches = useMemo(() => {
    if (!searchValue) {
      return branches;
    }
    const search = searchValue.toLowerCase();
    return branches.filter((branch) =>
      branch.name.toLowerCase().includes(search),
    );
  }, [branches, searchValue]);

  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearchValue("");
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

  const defaultBranch = branches.find(
    (b) => b.name === "main" || !b.parent_branch_id,
  );

  const isExactMatch = useMemo(
    () =>
      filteredBranches.some(
        (b) => b.name.toLowerCase() === searchValue.toLowerCase(),
      ),
    [filteredBranches, searchValue],
  );

  return (
    <Combobox store={combobox} withinPortal position="bottom-start">
      <Combobox.Target>
        <Select
          placeholder={t`Select branch`}
          value={displayBranch}
          onClick={() => combobox.toggleDropdown()}
          leftSection={<Icon name="git_branch" size={14} />}
          rightSection={
            isLoading || isCreatingBranch ? <Loader size="xs" /> : undefined
          }
          disabled={disabled || isCreatingBranch}
          readOnly
          data={[{ value: displayBranch, label: displayBranch }]}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Stack gap={0}>
          <Box p="sm">
            <TextInput
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
                    active={defaultBranch.name === currentBranch}
                  >
                    {defaultBranch.name}
                  </Combobox.Option>
                  <Divider my="sm" />
                </>
              )}

              {filteredBranches
                .filter((b) => b !== defaultBranch)
                .map((branch) => (
                  <Combobox.Option
                    key={branch.name}
                    value={branch.name}
                    onClick={() => handleBranchSelect(branch)}
                    active={branch.name === currentBranch}
                  >
                    {branch.name}
                  </Combobox.Option>
                ))}

              {searchValue && !isExactMatch && (
                <Combobox.Option
                  value="create-new"
                  onClick={() => handleCreateAndSwitch(searchValue)}
                  disabled={isCreatingBranch}
                >
                  <Text c="brand">{t`Create "${searchValue}"`}</Text>
                </Combobox.Option>
              )}

              {!searchValue && filteredBranches.length === 0 && (
                <Box p="md">
                  <Text size="sm" c="dimmed" ta="center">
                    {t`No branches found`}
                  </Text>
                </Box>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </Combobox.Dropdown>
    </Combobox>
  );
};
