import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
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

import { trackBranchCreated } from "../../analytics";

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
  const [sendToast] = useToast();
  const combobox = useCombobox();
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
    } catch (error) {
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
    <Combobox
      store={combobox}
      withinPortal
      width={280}
      position="bottom-start"
      disabled={disabled || isLoading || isCreating}
    >
      <Combobox.Target>
        <Button
          px="0.5rem"
          py="1rem"
          size="compact-sm"
          variant="default"
          justify="left"
          flex={1}
          disabled={disabled || isLoading || isCreating}
          onClick={() => combobox.toggleDropdown()}
          leftSection={<Icon name="git_branch" c="text-secondary" size={14} />}
          rightSection={
            isLoading || isCreating ? (
              <Loader size="xs" />
            ) : (
              <Icon
                name="chevrondown"
                c="text-secondary"
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
          <Text fw="bold" c="text-secondary" size="sm" lh="md" truncate>
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
            data-autofocus
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
    </Combobox>
  );
};
