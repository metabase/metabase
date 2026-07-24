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
  Stack,
} from "metabase/ui";
import type { ContentDiagnosticsFilterType } from "metabase-types/api";

import type { ContentDiagnosticsFilterOptions } from "../types";
import { getFilterTypeLabel } from "../utils";

type DiagnosticsFilterPickerProps = {
  filterOptions: ContentDiagnosticsFilterOptions;
  availableTypes: ContentDiagnosticsFilterType[];
  isDisabled?: boolean;
  hasDefaultOptions?: boolean;
  onFilterOptionsChange: (
    filterOptions: ContentDiagnosticsFilterOptions,
  ) => void;
};

export function DiagnosticsFilterPicker({
  filterOptions,
  availableTypes,
  isDisabled = false,
  hasDefaultOptions = false,
  onFilterOptionsChange,
}: DiagnosticsFilterPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  const handleTypesChange = (newValue: string[]) => {
    const entityTypes = availableTypes.filter((type) =>
      newValue.includes(type),
    );
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
