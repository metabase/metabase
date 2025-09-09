import { useMemo, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Menu, NumberInput, TextInput } from "metabase/ui";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

interface ChartSettingGoalInputProps {
  id: string;
  value: number | string;
  onChange: (value: number | string) => void;
  columns?: DatasetColumn[];
  valueField?: string;
}

const RIGHT_SECTION_BUTTON_WIDTH = 22;
const RIGHT_SECTION_BUTTON_PADDING = 10;

export const ChartSettingGoalInput = ({
  id,
  value,
  onChange,
  columns = [],
  valueField,
}: ChartSettingGoalInputProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const numericColumns = useMemo(() => {
    if (!columns?.length) {
      return [];
    }
    return columns.filter(isNumeric).map((col) => ({
      value: col.name,
      label: col.display_name || col.name,
    }));
  }, [columns]);

  const isColumnReference =
    typeof value === "string" &&
    numericColumns.some((col) => col.value === value);

  const numericValue = typeof value === "number" ? value : 0;
  const availableColumns = numericColumns.filter(
    (col) => col.value !== valueField,
  );
  const hasNumericColumns = availableColumns.length > 0;

  const selectedColumn = isColumnReference
    ? numericColumns.find((col) => col.value === value)
    : null;

  const handleColumnSelect = (selectedColumnValue: string) => {
    onChange(selectedColumnValue);
    setIsPopoverOpen(false);
  };

  const handleClearColumn = () => {
    onChange(0);
  };

  const rightSectionWidth =
    [hasNumericColumns, isColumnReference].filter(Boolean).length *
      RIGHT_SECTION_BUTTON_WIDTH +
    RIGHT_SECTION_BUTTON_PADDING;

  const rightSection = (
    <>
      {isColumnReference && (
        <ActionIcon
          c="text-medium"
          size="sm"
          radius="xl"
          p={0}
          onClick={handleClearColumn}
          title={t`Clear column selection`}
        >
          <Icon name="close" />
        </ActionIcon>
      )}
      {hasNumericColumns && (
        <Menu
          opened={isPopoverOpen}
          onChange={setIsPopoverOpen}
          position="bottom-end"
          withArrow
        >
          <Menu.Target>
            <ActionIcon c="text-medium" size="sm" radius="xl" p={0}>
              <Icon name="chevrondown" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown miw={320}>
            {availableColumns.map((column) => (
              <Menu.Item
                key={column.value}
                onClick={() => handleColumnSelect(column.value)}
              >
                {column.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
    </>
  );

  if (isColumnReference) {
    return (
      <TextInput
        id={id}
        value={selectedColumn?.label || value}
        readOnly
        placeholder={selectedColumn?.label || value}
        rightSection={rightSection}
        rightSectionPointerEvents="all"
        rightSectionProps={{
          style: { width: rightSectionWidth },
        }}
        styles={{
          input: {
            paddingRight: rightSectionWidth,
          },
        }}
      />
    );
  }

  return (
    <NumberInput
      id={id}
      value={numericValue}
      onChange={(val) => onChange(val ?? 0)}
      placeholder={t`Enter goal value`}
      rightSection={rightSection}
      rightSectionPointerEvents="all"
      rightSectionProps={{
        style: { width: rightSectionWidth },
      }}
      styles={{
        input: {
          paddingRight: rightSectionWidth,
        },
      }}
    />
  );
};
