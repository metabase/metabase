import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Checkbox,
  FixedSizeIcon,
  Popover,
  Stack,
  Tooltip,
} from "metabase/ui";
import type { SearchModel } from "metabase-types/api";

import { getSearchModelItems } from "./utils";

type SearchModelPickerProps = {
  searchModels: SearchModel[];
  onSearchModelsChange: (models: SearchModel[]) => void;
};

export function SearchModelPicker({
  searchModels,
  onSearchModelsChange,
}: SearchModelPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <Tooltip label={t`Filter`}>
          <ActionIcon onClick={toggle}>
            <FixedSizeIcon c="text-primary" name="filter" />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <SearchModelPopover
          searchModels={searchModels}
          onSearchModelsChange={onSearchModelsChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type SearchModelPopoverProps = {
  searchModels: SearchModel[];
  onSearchModelsChange: (models: SearchModel[]) => void;
};

function SearchModelPopover({
  searchModels,
  onSearchModelsChange,
}: SearchModelPopoverProps) {
  const items = getSearchModelItems();

  const handleChange = (value: string[]) => {
    onSearchModelsChange(value as SearchModel[]);
  };

  return (
    <Box w="15rem" p="md">
      <Checkbox.Group value={searchModels} onChange={handleChange}>
        <Stack gap="0.75rem">
          {items.map((item) => (
            <Checkbox key={item.value} value={item.value} label={item.label} />
          ))}
        </Stack>
      </Checkbox.Group>
    </Box>
  );
}
