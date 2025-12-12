import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Box, Button, FixedSizeIcon, Popover, Stack } from "metabase/ui";
import type { DependencyGroupType } from "metabase-types/api";

import type { DependencyListViewParams } from "../types";

import { TypeFilterPicker } from "./TypeFilterPicker";

type FilterOptionsPickerProps = {
  params: DependencyListViewParams;
  availableGroupTypes: DependencyGroupType[];
  onParamsChange: (params: DependencyListViewParams) => void;
};

export function FilterOptionsPicker({
  params,
  availableGroupTypes,
  onParamsChange,
}: FilterOptionsPickerProps) {
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
        <ListFilterPopover
          params={params}
          availableGroupTypes={availableGroupTypes}
          onParamsChange={onParamsChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type ListFilterPopoverProps = {
  params: DependencyListViewParams;
  availableGroupTypes: DependencyGroupType[];
  onParamsChange: (params: DependencyListViewParams) => void;
};

function ListFilterPopover({
  params,
  availableGroupTypes,
  onParamsChange,
}: ListFilterPopoverProps) {
  const handleTypesChange = (types: DependencyGroupType[]) => {
    onParamsChange({ ...params, types });
  };

  return (
    <Box w="20rem" p="md">
      <Stack>
        <TypeFilterPicker
          groupTypes={params.types ?? []}
          availableGroupTypes={availableGroupTypes}
          onChange={handleTypesChange}
        />
      </Stack>
    </Box>
  );
}
