import { useDisclosure } from "@mantine/hooks";
import type { ChangeEvent } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Checkbox,
  FixedSizeIcon,
  Indicator,
  Input,
  Popover,
  Select,
  Stack,
} from "metabase/ui";
import type { ContentDiagnosticsFilterType } from "metabase-types/api";

import { getDurationFilterOptions } from "../slow-utils";
import type { SlowContentFilterOptions } from "../types";
import { getFilterTypeLabel } from "../utils";

type SlowDiagnosticsFilterPickerProps = {
  filterOptions: SlowContentFilterOptions;
  availableTypes: ContentDiagnosticsFilterType[];
  isDisabled?: boolean;
  hasDefaultOptions?: boolean;
  onFilterOptionsChange: (filterOptions: SlowContentFilterOptions) => void;
};

export function SlowDiagnosticsFilterPicker({
  filterOptions,
  availableTypes,
  isDisabled = false,
  hasDefaultOptions = false,
  onFilterOptionsChange,
}: SlowDiagnosticsFilterPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();
  const durationOptions = getDurationFilterOptions();

  const handleTypesChange = (newValue: string[]) => {
    const selectedTypes = availableTypes.filter((type) =>
      newValue.includes(type),
    );
    const entityTypes =
      selectedTypes.length > 0 ? selectedTypes : availableTypes;
    onFilterOptionsChange({ ...filterOptions, entityTypes });
  };

  const handleDurationChange = (value: string | null) => {
    onFilterOptionsChange({
      ...filterOptions,
      minDurationMs: value != null ? Number(value) : undefined,
    });
  };

  const handlePersonalCollectionsChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    onFilterOptionsChange({
      ...filterOptions,
      includePersonalCollections: event.target.checked,
    });
  };

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <Indicator size={8} offset={12} disabled={hasDefaultOptions}>
          <Button
            leftSection={<FixedSizeIcon name="filter" aria-hidden />}
            disabled={isDisabled}
            data-testid="content-diagnostics-filter-button"
            onClick={toggle}
          >
            {t`Filter`}
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Box w="20rem" p="md">
          <Stack>
            {availableTypes.length > 0 && (
              <Checkbox.Group
                label={t`Entity type`}
                value={filterOptions.entityTypes}
                onChange={handleTypesChange}
              >
                <Stack gap="sm" mt="sm">
                  {availableTypes.map((type) => (
                    <Checkbox
                      key={type}
                      value={type}
                      label={getFilterTypeLabel(type)}
                    />
                  ))}
                </Stack>
              </Checkbox.Group>
            )}
            <Input.Wrapper label={t`Duration`}>
              <Select
                mt="sm"
                data={durationOptions.map((option) => ({
                  value: String(option.value),
                  label: option.label,
                }))}
                value={
                  filterOptions.minDurationMs != null
                    ? String(filterOptions.minDurationMs)
                    : null
                }
                placeholder={t`Any duration`}
                clearable
                onChange={handleDurationChange}
              />
            </Input.Wrapper>
            <Input.Wrapper label={t`Location`}>
              <Stack gap="sm" mt="sm">
                <Checkbox
                  label={t`Include items in personal collections`}
                  checked={filterOptions.includePersonalCollections}
                  onChange={handlePersonalCollectionsChange}
                />
              </Stack>
            </Input.Wrapper>
          </Stack>
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}
