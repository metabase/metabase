import { useDisclosure } from "@mantine/hooks";
import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { Box, Button, FixedSizeIcon, Group, Popover, Stack } from "metabase/ui";
import type {
  CardType,
  DependencyGroupType,
  DependencyType,
} from "metabase-types/api";

import type { DependencyListFilterOptions } from "../../types";

import { TypeFilterPicker } from "./TypeFilterPicker";

type DependencyFilterPickerProps = {
  filterOptions: DependencyListFilterOptions;
  availableGroupTypes: DependencyGroupType[];
  onFilterOptionsChange: (filterOptions: DependencyListFilterOptions) => void;
};

export function DependencyFilterPicker({
  filterOptions,
  availableGroupTypes,
  onFilterOptionsChange,
}: DependencyFilterPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <Button
          leftSection={<FixedSizeIcon name="filter" aria-hidden />}
          onClick={toggle}
        >
          {t`Filter`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <DependencyFilterPickerPopover
          filterOptions={filterOptions}
          availableGroupTypes={availableGroupTypes}
          onFilterOptionsChange={onFilterOptionsChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type DependencyFilterPickerPopoverProps = {
  filterOptions: DependencyListFilterOptions;
  availableGroupTypes: DependencyGroupType[];
  onFilterOptionsChange: (filterOptions: DependencyListFilterOptions) => void;
};

function DependencyFilterPickerPopover({
  filterOptions: initialFilterOptions,
  availableGroupTypes,
  onFilterOptionsChange,
}: DependencyFilterPickerPopoverProps) {
  const [filterOptions, setFilterOptions] = useState(initialFilterOptions);

  const handleTypesChange = (
    types: DependencyType[],
    cardTypes: CardType[],
  ) => {
    setFilterOptions({ ...filterOptions, types, cardTypes });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onFilterOptionsChange(filterOptions);
  };

  return (
    <Box component="form" w="15rem" p="md" onSubmit={handleSubmit}>
      <Stack>
        <TypeFilterPicker
          types={filterOptions.types}
          cardTypes={filterOptions.cardTypes}
          availableGroupTypes={availableGroupTypes}
          onChange={handleTypesChange}
        />
        <Group justify="end">
          <Button variant="filled">{t`Apply`}</Button>
        </Group>
      </Stack>
    </Box>
  );
}
