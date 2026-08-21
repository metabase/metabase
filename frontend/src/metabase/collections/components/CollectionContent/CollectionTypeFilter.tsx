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
  // Nothing checked means no filter is applied and every type is listed.
  const checkedFilters = selectedFilters ?? [];
  // Types without items stay visible but disabled; a checked type stays
  // enabled even after its last item is gone, so it can be unchecked.
  const options = TYPE_FILTER_MODELS.map((model) => ({
    value: model,
    label: getTranslatedEntityName(model) ?? model,
    disabled:
      !availableModels.includes(model) && !checkedFilters.includes(model),
  }));
  const isFiltering = checkedFilters.length > 0;

  if (options.every((option) => option.disabled)) {
    return null;
  }

  const handleToggle = (filter: CollectionItemModel) => {
    const nextFilters = checkedFilters.includes(filter)
      ? checkedFilters.filter((checkedFilter) => checkedFilter !== filter)
      : [...checkedFilters, filter];
    onSelectedFiltersChange(nextFilters.length > 0 ? nextFilters : null);
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
        <Stack gap="md" px="1.25rem" py="md" miw="11rem">
          <Text id={headingId} fw="bold">
            {t`Filter by type`}
          </Text>
          <Stack gap="0.75rem">
            {options.map(({ value, label, disabled }) => (
              <Checkbox
                key={value}
                value={value}
                label={label}
                disabled={disabled}
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
