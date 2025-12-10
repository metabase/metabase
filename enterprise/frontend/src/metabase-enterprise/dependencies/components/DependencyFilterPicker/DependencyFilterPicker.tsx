import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Box, Button, FixedSizeIcon, Popover, Stack } from "metabase/ui";
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
  filterOptions,
  availableGroupTypes,
  onFilterOptionsChange,
}: DependencyFilterPickerPopoverProps) {
  const handleTypesChange = (
    types: DependencyType[],
    cardTypes: CardType[],
  ) => {
    onFilterOptionsChange({ ...filterOptions, types, cardTypes });
  };

  return (
    <Box w="20rem" p="md">
      <Stack>
        <TypeFilterPicker
          types={filterOptions.types}
          cardTypes={filterOptions.cardTypes}
          availableGroupTypes={availableGroupTypes}
          onChange={handleTypesChange}
        />
      </Stack>
    </Box>
  );
}
