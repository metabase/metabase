import { useDisclosure } from "@mantine/hooks";
import type { ChangeEvent } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  FixedSizeIcon,
  Indicator,
  Input,
  Popover,
  Stack,
} from "metabase/ui";

export type DiagnosticsFilterValue<T extends string> = {
  types: T[];
  includePersonalCollections: boolean;
};

type DiagnosticsFilterPickerProps<T extends string> = {
  availableTypes: T[];
  selectedTypes: T[];
  includePersonalCollections: boolean;
  getTypeLabel: (type: T) => string;
  isCompact?: boolean;
  isDisabled?: boolean;
  hasDefaultOptions?: boolean;
  buttonTestId?: string;
  onChange: (value: DiagnosticsFilterValue<T>) => void;
};

/**
 * Shared entity-type + location filter for Monitor diagnostics tabs (Dependency
 * and Content diagnostics). Presentational — the caller owns the filter state,
 * the labels, and which entity types are supported.
 */
export function DiagnosticsFilterPicker<T extends string>({
  availableTypes,
  selectedTypes,
  includePersonalCollections,
  getTypeLabel,
  isCompact = false,
  isDisabled = false,
  hasDefaultOptions = false,
  buttonTestId,
  onChange,
}: DiagnosticsFilterPickerProps<T>) {
  const [isOpened, { toggle, close }] = useDisclosure();

  const handleTypesChange = (newValue: string[]) => {
    const types = availableTypes.filter((type) => newValue.includes(type));
    onChange({ types, includePersonalCollections });
  };

  const handlePersonalCollectionsChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    onChange({
      types: selectedTypes,
      includePersonalCollections: event.target.checked,
    });
  };

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <Indicator
          size={8}
          offset={isCompact ? 6 : 12}
          disabled={hasDefaultOptions}
        >
          {isCompact ? (
            <ActionIcon
              aria-label={t`Filter`}
              disabled={isDisabled}
              onClick={toggle}
            >
              <FixedSizeIcon c="text-primary" name="filter" />
            </ActionIcon>
          ) : (
            <Button
              leftSection={<FixedSizeIcon name="filter" aria-hidden />}
              disabled={isDisabled}
              data-testid={buttonTestId}
              onClick={toggle}
            >
              {t`Filter`}
            </Button>
          )}
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Box w="20rem" p="md">
          <Stack>
            {availableTypes.length > 0 && (
              <Checkbox.Group
                label={t`Entity type`}
                value={selectedTypes}
                onChange={handleTypesChange}
              >
                <Stack gap="sm" mt="sm">
                  {availableTypes.map((type) => (
                    <Checkbox
                      key={type}
                      value={type}
                      label={getTypeLabel(type)}
                    />
                  ))}
                </Stack>
              </Checkbox.Group>
            )}
            <Input.Wrapper label={t`Location`}>
              <Stack gap="sm" mt="sm">
                <Checkbox
                  label={t`Include items in personal collections`}
                  checked={includePersonalCollections}
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
