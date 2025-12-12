import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useSearchQuery } from "metabase/api";
import {
  ActionIcon,
  Box,
  Center,
  Checkbox,
  FixedSizeIcon,
  Loader,
  Popover,
  Stack,
} from "metabase/ui";
import type { SearchModel } from "metabase-types/api";

import S from "./SearchModelPicker.module.css";
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
    <Popover opened={isOpened} position="right" onDismiss={close}>
      <Popover.Target>
        <ActionIcon
          className={S.button}
          aria-label={t`Filter`}
          onClick={toggle}
        >
          <FixedSizeIcon c="text-primary" name="filter" />
        </ActionIcon>
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
  const { data, isLoading } = useSearchQuery({
    models: ["card"],
    limit: 0,
    calculate_available_models: true,
  });
  const items = data ? getSearchModelItems(data) : [];

  const handleChange = (value: string[]) => {
    onSearchModelsChange(value as SearchModel[]);
  };

  return (
    <Box w="15rem" p="md">
      {isLoading ? (
        <Center>
          <Loader />
        </Center>
      ) : (
        <Checkbox.Group value={searchModels} onChange={handleChange}>
          <Stack gap="0.75rem">
            {items.map((item) => (
              <Checkbox
                key={item.value}
                value={item.value}
                label={item.label}
              />
            ))}
          </Stack>
        </Checkbox.Group>
      )}
    </Box>
  );
}
