import { useDisclosure } from "@mantine/hooks";
import { useId } from "react";
import { t } from "ttag";

import type {
  CollectionItemTypeFilterOption,
  CollectionItemTypeFilterValue,
} from "metabase/common/collections/types";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import {
  Button,
  Checkbox,
  Icon,
  Indicator,
  Popover,
  Stack,
  Text,
} from "metabase/ui";
import type { CollectionAuthorityLevelFilter } from "metabase-types/api";

import { TYPE_FILTER_MODELS } from "./constants";

type CollectionTypeFilterProps = {
  availableModels: string[];
  availableAuthorityLevels?: CollectionAuthorityLevelFilter[];
  selectedFilters: CollectionItemTypeFilterValue[] | null;
  onSelectedFiltersChange: (
    filters: CollectionItemTypeFilterValue[] | null,
  ) => void;
};

export function CollectionTypeFilter({
  availableModels,
  availableAuthorityLevels,
  selectedFilters,
  onSelectedFiltersChange,
}: CollectionTypeFilterProps) {
  const [opened, { close, toggle }] = useDisclosure(false);
  const headingId = useId();
  const baseOptions: CollectionItemTypeFilterOption[] =
    TYPE_FILTER_MODELS.filter((model) => availableModels.includes(model)).map(
      (model) => ({
        value: model,
        model,
        label: getTranslatedEntityName(model) ?? model,
      }),
    );
  const options = PLUGIN_COLLECTIONS.getCollectionItemTypeFilterOptions(
    baseOptions,
    availableAuthorityLevels ?? [],
  );
  const optionValues = options.map(({ value }) => value);
  const checkedFilters = selectedFilters ?? optionValues;
  const isFiltering = selectedFilters != null;

  if (options.length === 0) {
    return null;
  }

  const handleToggle = (filter: CollectionItemTypeFilterValue) => {
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
      shadow="md"
      returnFocus
    >
      <Indicator
        disabled={!isFiltering}
        size={8}
        data-testid="type-filter-indicator"
      >
        <Popover.Target>
          <Button
            variant="default"
            leftSection={<Icon name="filter" aria-hidden />}
            onClick={toggle}
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
        <Stack gap="sm" p="md" miw="11rem">
          <Text id={headingId} fw="bold">{t`Filter by type`}</Text>
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
      </Popover.Dropdown>
    </Popover>
  );
}
