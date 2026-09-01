import { useDisclosure } from "@mantine/hooks";
import type { ChangeEvent, ReactNode } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Checkbox,
  FixedSizeIcon,
  Indicator,
  Input,
  Popover,
  Stack,
} from "metabase/ui";
import type { ContentDiagnosticsFilterType } from "metabase-types/api";

import type { ContentDiagnosticsBaseFilterOptions } from "../types";
import { getFilterTypeLabel } from "../utils";

type DiagnosticsFilterPickerProps<
  TType extends ContentDiagnosticsFilterType,
  TOptions extends ContentDiagnosticsBaseFilterOptions<TType>,
> = {
  filterOptions: TOptions;
  availableTypes: TType[];
  isDisabled?: boolean;
  hasDefaultOptions?: boolean;
  extraFilters?: ReactNode;
  onFilterOptionsChange: (filterOptions: TOptions) => void;
};

export function DiagnosticsFilterPicker<
  TType extends ContentDiagnosticsFilterType,
  TOptions extends ContentDiagnosticsBaseFilterOptions<TType>,
>({
  filterOptions,
  availableTypes,
  isDisabled = false,
  hasDefaultOptions = false,
  extraFilters,
  onFilterOptionsChange,
}: DiagnosticsFilterPickerProps<TType, TOptions>) {
  const [isOpened, { toggle, close }] = useDisclosure();

  const handleTypesChange = (newValue: string[]) => {
    const selectedTypes = availableTypes.filter((type) =>
      newValue.includes(type),
    );
    const entityTypes =
      selectedTypes.length > 0 ? selectedTypes : availableTypes;
    onFilterOptionsChange({ ...filterOptions, entityTypes });
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
        <Indicator
          size={8}
          offset={12}
          disabled={hasDefaultOptions}
          attributes={{
            indicator: {
              "data-testid": "content-diagnostics-filter-indicator",
            },
          }}
        >
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
            {extraFilters}
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
