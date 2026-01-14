import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import type * as Urls from "metabase/lib/urls";
import { Box, Button, FixedSizeIcon, Popover, Stack } from "metabase/ui";

import type { DependencyListMode } from "../../types";

import { LocationFilterPicker } from "./LocationFilterPicker";
import { TypeFilterPicker } from "./TypeFilterPicker";

type FilterOptionsPickerProps = {
  mode: DependencyListMode;
  params: Urls.DependencyListParams;
  onParamsChange: (params: Urls.DependencyListParams) => void;
};

export function FilterOptionsPicker({
  mode,
  params,
  onParamsChange,
}: FilterOptionsPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <Button
          leftSection={<FixedSizeIcon name="filter" aria-hidden />}
          data-testid="dependency-list-filter-button"
          onClick={toggle}
        >
          {t`Filter`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterOptionsPopover
          mode={mode}
          params={params}
          onParamsChange={onParamsChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type FilterOptionsPopoverProps = {
  mode: DependencyListMode;
  params: Urls.DependencyListParams;
  onParamsChange: (params: Urls.DependencyListParams) => void;
};

function FilterOptionsPopover({
  mode,
  params,
  onParamsChange,
}: FilterOptionsPopoverProps) {
  return (
    <Box w="20rem" p="md">
      <Stack>
        <TypeFilterPicker
          mode={mode}
          params={params}
          onParamsChange={onParamsChange}
        />
        <LocationFilterPicker params={params} onParamsChange={onParamsChange} />
      </Stack>
    </Box>
  );
}
