import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

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
  useCombobox,
} from "metabase/ui";
import {
  useCreateBranchMutation,
  useGetBranchesQuery,
} from "metabase-enterprise/api";

export interface BranchPickerProps {
  value: string;
  onChange: (branch: string, isNewBranch?: boolean) => void;
  disabled?: boolean;
  isLoading?: boolean;
  baseBranch?: string;
  allowCreate?: boolean;
}

export const BranchPicker = ({
  value,
  onChange,
  disabled = false,
  isLoading = false,
  baseBranch = "main",
  allowCreate = true,
}: BranchPickerProps) => {
  const combobox = useCombobox();
  const [searchValue, setSearchValue] = useState("");
  const { data: branchesData, isLoading: branchesLoading } =
    useGetBranchesQuery();
  const [createBranch, { isLoading: isCreating }] = useCreateBranchMutation();

  const branches = useMemo(() => branchesData?.items || [], [branchesData]);

  const filteredBranches = useMemo(() => {
    if (!searchValue) {
      return branches;
    }
    const search = searchValue.toLowerCase();
    return branches
      .filter((branch) => branch.toLowerCase().includes(search))
      .slice(0, 5);
  }, [branches, searchValue]);

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
    onChange(searchValue, true);
    setSearchValue("");
    createBranch({
      name: searchValue,
      baseBranch: baseBranch || value,
    });
  };

  useEffect(() => {
    if (!combobox.dropdownOpened) {
      setSearchValue("");
    }
  }, [combobox.dropdownOpened]);

  return (
    <Combobox
      store={combobox}
      withinPortal
      width={280}
      position="bottom-start"
      disabled={disabled || isLoading}
    >
      <Combobox.Target>
        <Button
          size="compact-sm"
          disabled={disabled || isLoading}
          onClick={() => combobox.toggleDropdown()}
          leftSection={<Icon name="schema" c="brand" size={16} />}
          rightSection={
            isLoading ? (
              <Loader size="xs" />
            ) : (
              <Icon
                name="chevrondown"
                size={12}
                style={{
                  transform: combobox.dropdownOpened
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                  transition: "transform 200ms ease",
                }}
              />
            )
          }
          data-testid="branch-picker-button"
        >
          <Text fw="bold" c="brand" size="sm" truncate>
            {value}
          </Text>
        </Button>
      </Combobox.Target>

      <Combobox.Dropdown p={0}>
        <Box p="sm">
          <TextInput
            placeholder={t`Find or create a branch...`}
            value={searchValue}
            onChange={(e) => setSearchValue(e.currentTarget.value)}
            leftSection={<Icon name="search" size={16} />}
            size="sm"
            data-autofocus
          />
        </Box>

        <Divider />

        <ScrollArea.Autosize mah={320} type="hover">
          {branchesLoading ? (
            <Flex justify="center" align="center" p="xl">
              <Loader size="sm" />
            </Flex>
          ) : (
            <>
              {filteredBranches.length === 0 && !showCreateOption ? (
                <Box p="md">
                  <Text size="sm" c="text-light" ta="center">
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
                        <Box px="xs" py="xs">
                          <Text
                            size="xs"
                            c="text-light"
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
                            <Group justify="space-between" wrap="nowrap">
                              <Group gap="xs" wrap="nowrap">
                                <Icon
                                  name="schema"
                                  size={16}
                                  c={branch === value ? "brand" : "text"}
                                />
                                <Text fw={branch === value ? "bold" : "normal"}>
                                  {branch}
                                </Text>
                              </Group>
                              {branch === value && (
                                <Icon name="check" size={16} c="success" />
                              )}
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
                            <Text>{t`Create branch "${searchValue}"`}</Text>
                            <Text size="xs" c="text-light">
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
    </Combobox>
  );
};
