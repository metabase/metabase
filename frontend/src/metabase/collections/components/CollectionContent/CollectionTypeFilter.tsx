import { useDisclosure } from "@mantine/hooks";
import { useId } from "react";
import { t } from "ttag";

import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import {
  Button,
  Checkbox,
  Icon,
  Indicator,
  Popover,
  Stack,
  Text,
} from "metabase/ui";
import type { CollectionItemModel } from "metabase-types/api";

import { TYPE_FILTER_MODELS } from "./constants";

type CollectionTypeFilterProps = {
  availableModels: string[];
  selectedFilters: CollectionItemModel[] | null;
  onSelectedFiltersChange: (filters: CollectionItemModel[] | null) => void;
};

export function CollectionTypeFilter({
  availableModels,
  selectedFilters,
  onSelectedFiltersChange,
}: CollectionTypeFilterProps) {
  const [opened, { close, toggle }] = useDisclosure(false);
  const headingId = useId();
  const options = TYPE_FILTER_MODELS.filter((model) =>
    availableModels.includes(model),
  ).map((model) => ({
    value: model,
    label: getTranslatedEntityName(model) ?? model,
  }));
  const optionValues = options.map(({ value }) => value);
  const checkedFilters = selectedFilters ?? optionValues;
  const isFiltering = selectedFilters != null;

  if (options.length === 0) {
    return null;
  }

  const handleToggle = (filter: CollectionItemModel) => {
    const nextFilters = checkedFilters.includes(filter)
      ? checkedFilters.filter((checkedFilter) => checkedFilter !== filter)
      : [...checkedFilters, filter];
    const coversAllOptions = options.every((option) =>
      nextFilters.includes(option.value),
    );
    onSelectedFiltersChange(coversAllOptions ? null : nextFilters);
  };

  return (
    <Popover
      opened={opened}
      onDismiss={close}
      position="bottom-end"
      shadow="sm"
      returnFocus
    >
      <Indicator
        disabled={!isFiltering}
        size={7}
        data-testid="type-filter-indicator"
        offset={12}
      >
        <Popover.Target>
          <Button
            variant="default"
            leftSection={<Icon name="filter" aria-hidden />}
            onClick={toggle}
            aria-label={isFiltering ? t`Filter, filters applied` : undefined}
            data-testid="collection-type-filter-button"
          >
            {t`Filter`}
          </Button>
        </Popover.Target>
      </Indicator>
      <Popover.Dropdown
        aria-labelledby={headingId}
        data-testid="collection-type-filter-popover"
      >
        <Stack gap="lg" px="1.25rem" py="lg" miw="11rem">
          <Text id={headingId} fw="bold">
            {t`Filter by type`}
          </Text>
          <Stack gap="0.75rem">
            {options.map(({ value, label }) => (
              <Checkbox
                key={value}
                value={value}
                label={label}
                checked={checkedFilters.includes(value)}
                onChange={() => handleToggle(value)}
              />
            ))}
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
