import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListUserRecipientsQuery } from "metabase/api";
import { Button, Flex, Icon, MultiSelect, Popover, Stack } from "metabase/ui";
import type {
  DependencyType,
  UnreferencedItemCardType,
  UserId,
} from "metabase-types/api";

const CARD_TYPES: UnreferencedItemCardType[] = ["question", "model", "metric"];

const NON_CARD_TYPES: Exclude<DependencyType, "card">[] = [
  "table",
  "transform",
  "dashboard",
  "document",
  "snippet",
  "sandbox",
];

export type EntityTypeFilterValue =
  | UnreferencedItemCardType
  | Exclude<DependencyType, "card">;

export interface TasksFilterState {
  entityTypes: EntityTypeFilterValue[];
  creatorIds: UserId[];
  lastModifiedByIds: UserId[];
}

export function getFilterApiParams(filters: TasksFilterState): {
  types?: DependencyType[];
  card_types?: UnreferencedItemCardType[];
} {
  const cardTypes = filters.entityTypes.filter(
    (t): t is UnreferencedItemCardType =>
      CARD_TYPES.includes(t as UnreferencedItemCardType),
  );
  const nonCardTypes = filters.entityTypes.filter(
    (t): t is Exclude<DependencyType, "card"> =>
      NON_CARD_TYPES.includes(t as Exclude<DependencyType, "card">),
  );

  const types: DependencyType[] = [...nonCardTypes];
  if (cardTypes.length > 0) {
    types.push("card");
  }

  return {
    types: types.length > 0 ? types : undefined,
    card_types: cardTypes.length > 0 ? cardTypes : undefined,
  };
}

const EMPTY_FILTER_STATE: TasksFilterState = {
  entityTypes: [],
  creatorIds: [],
  lastModifiedByIds: [],
};

interface TasksFilterButtonProps {
  value: TasksFilterState;
  onChange: (value: TasksFilterState) => void;
}

export function TasksFilterButton({ value, onChange }: TasksFilterButtonProps) {
  const entityTypeOptions = useMemo(
    () => [
      { value: "question", label: t`Question` },
      { value: "model", label: t`Model` },
      { value: "metric", label: t`Metric` },
      { value: "table", label: t`Table` },
      { value: "transform", label: t`Transform` },
      { value: "dashboard", label: t`Dashboard` },
      { value: "document", label: t`Document` },
      { value: "snippet", label: t`Snippet` },
      { value: "sandbox", label: t`Sandbox` },
    ],
    [],
  );
  const [opened, { open, close }] = useDisclosure(false);
  const [localState, setLocalState] = useState<TasksFilterState>(value);

  const { data: usersData, isLoading: isLoadingUsers } =
    useListUserRecipientsQuery();

  const userOptions = useMemo(() => {
    if (!usersData?.data) {
      return [];
    }
    return usersData.data.map((user) => ({
      value: String(user.id),
      label: user.common_name,
    }));
  }, [usersData]);

  const hasActiveFilters =
    value.entityTypes.length > 0 ||
    value.creatorIds.length > 0 ||
    value.lastModifiedByIds.length > 0;

  const handleOpen = () => {
    setLocalState(value);
    open();
  };

  const handleEntityTypeChange = (values: string[]) => {
    setLocalState((prev) => ({
      ...prev,
      entityTypes: values as EntityTypeFilterValue[],
    }));
  };

  const handleCreatorChange = (values: string[]) => {
    setLocalState((prev) => ({
      ...prev,
      creatorIds: values.map(Number),
    }));
  };

  const handleLastModifiedByChange = (values: string[]) => {
    setLocalState((prev) => ({
      ...prev,
      lastModifiedByIds: values.map(Number),
    }));
  };

  const handleClear = () => {
    onChange(EMPTY_FILTER_STATE);
    close();
  };

  const handleApply = () => {
    onChange(localState);
    close();
  };

  return (
    <Popover
      opened={opened}
      onChange={(isOpen) => !isOpen && close()}
      position="bottom-end"
    >
      <Popover.Target>
        <Button
          variant={hasActiveFilters ? "filled" : "default"}
          leftSection={<Icon name="filter" />}
          onClick={handleOpen}
        >
          {t`Filter`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="lg" w={340}>
        <Stack gap="lg">
          <MultiSelect
            label={t`Entity type`}
            placeholder={t`Pick one or more types`}
            data={entityTypeOptions}
            value={localState.entityTypes}
            onChange={handleEntityTypeChange}
            clearable
            comboboxProps={{ withinPortal: false }}
          />

          <MultiSelect
            label={t`Creator`}
            placeholder={t`Pick one or more people`}
            data={userOptions}
            value={localState.creatorIds.map(String)}
            onChange={handleCreatorChange}
            searchable
            clearable
            disabled={isLoadingUsers}
            comboboxProps={{ withinPortal: false }}
          />

          <MultiSelect
            label={t`Last modified by`}
            placeholder={t`Pick one or more people`}
            data={userOptions}
            value={localState.lastModifiedByIds.map(String)}
            onChange={handleLastModifiedByChange}
            searchable
            clearable
            disabled={isLoadingUsers}
            comboboxProps={{ withinPortal: false }}
          />

          <Flex gap="md" pt="sm">
            <Button flex={1} onClick={handleClear}>
              {t`Clear filters`}
            </Button>
            <Button flex={1} variant="filled" onClick={handleApply}>
              {t`Apply`}
            </Button>
          </Flex>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
