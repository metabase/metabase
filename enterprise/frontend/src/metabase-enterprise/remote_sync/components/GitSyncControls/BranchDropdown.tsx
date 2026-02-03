import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  Box,
  Combobox,
  type ComboboxStore,
  Divider,
  Flex,
  Group,
  Icon,
  Loader,
  ScrollArea,
  Text,
  TextInput,
} from "metabase/ui";
import {
  useCreateBranchMutation,
  useGetBranchesQuery,
} from "metabase-enterprise/api";

import { trackBranchCreated } from "../../analytics";

export interface BranchDropdownProps {
  allowCreate?: boolean;
  baseBranch?: string;
  combobox: ComboboxStore;
  onChange: (branch: string, isNewBranch?: boolean) => void;
  value: string;
}

export const BranchDropdown = ({
  value,
  onChange,
  baseBranch = "main",
  allowCreate = true,
  combobox,
}: BranchDropdownProps) => {
  const [sendToast] = useToast();
  const [searchValue, setSearchValue] = useState("");
  const { data: branchesData, isLoading: branchesLoading } =
    useGetBranchesQuery();
  const [createBranch, { isLoading: isCreating }] = useCreateBranchMutation();

  const branches = useMemo(() => branchesData?.items || [], [branchesData]);

  const filteredBranches = useMemo(() => {
    const availableBranches = branches.filter((branch) => branch !== value);

    if (!searchValue) {
      return availableBranches;
    }
    const search = searchValue.toLowerCase();
    return availableBranches
      .filter((branch) => branch.toLowerCase().includes(search))
      .slice(0, 5);
  }, [branches, searchValue, value]);

  const exactMatch = branches.some(
    (branch) => branch.toLowerCase() === searchValue.toLowerCase(),
  );

  const showCreateOption =
    allowCreate && searchValue && !exactMatch && !isCreating;

  const handleBranchSelect = (branch: string, isNewBranch = false) => {
    onChange(branch, isNewBranch);
    setSearchValue("");
    combobox.closeDropdown();
  };

  const handleCreateBranch = async () => {
    combobox.closeDropdown();
    const branchName = searchValue;
    setSearchValue("");

    try {
      await createBranch({
        name: branchName,
      }).unwrap();

      trackBranchCreated({
        triggeredFrom: "branch-picker",
      });

      onChange(branchName, true);
    } catch {
      sendToast({
        message: t`Failed to create branch`,
        icon: "warning",
      });
    }
  };

  useEffect(() => {
    if (!combobox.dropdownOpened) {
      setSearchValue("");
    }
  }, [combobox.dropdownOpened]);

  return (
    <Combobox.Dropdown p={0}>
      <Box p="sm">
        <TextInput
          autoFocus
          leftSection={<Icon name="search" size={16} />}
          onChange={(e) => setSearchValue(e.currentTarget.value)}
          placeholder={t`Find or create a branch...`}
          value={searchValue}
        />
      </Box>

      <Divider />

      <ScrollArea.Autosize mah={320} type="hover">
        {branchesLoading || isCreating ? (
          <Flex justify="center" align="center" p="xl">
            <Loader size="sm" />
          </Flex>
        ) : (
          <>
            {filteredBranches.length === 0 && !showCreateOption ? (
              <Box p="md">
                <Text size="sm" c="text-tertiary" ta="center">
                  {searchValue
                    ? t`No branches found`
                    : t`No branches available`}
                </Text>
              </Box>
            ) : (
              <>
                {filteredBranches.length > 0 && (
                  <>
                    <Combobox.Options>
                      <Box px="sm" py="sm">
                        <Text
                          size="xs"
                          c="text-tertiary"
                          tt="uppercase"
                          fw="bold"
                        >
                          {t`Branches`}
                        </Text>
                      </Box>
                      {filteredBranches.map((branch) => (
                        <Combobox.Option
                          key={branch}
                          value={branch}
                          onClick={() => handleBranchSelect(branch)}
                          data-testid={`branch-item-${branch}`}
                          py="sm"
                        >
                          <Group gap="xs" wrap="nowrap">
                            <Text>{branch}</Text>
                          </Group>
                        </Combobox.Option>
                      ))}
                    </Combobox.Options>
                    {showCreateOption && <Divider />}
                  </>
                )}

                {showCreateOption && (
                  <Box p="sm">
                    <Combobox.Option
                      py="sm"
                      value="__create__"
                      onClick={handleCreateBranch}
                      data-testid="create-branch-button"
                    >
                      <Group gap="xs" wrap="nowrap">
                        <Icon name="add" size={16} />
                        <Box>
                          <Text lh="md">{t`Create branch "${searchValue}"`}</Text>
                          <Text size="xs" c="text-tertiary">
                            {t`from ${baseBranch || value}`}
                          </Text>
                        </Box>
                      </Group>
                    </Combobox.Option>
                  </Box>
                )}
              </>
            )}
          </>
        )}
      </ScrollArea.Autosize>
    </Combobox.Dropdown>
  );
};
