import { useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { Box, Group, Icon, Menu, NumberInput, TextInput } from "metabase/ui";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

import S from "./ChartSettingFieldPicker/ChartSettingFieldPicker.module.css";

const RIGHT_SECTION_WIDTH = "38px";

const inputStyles = {
  input: {
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    width: "100%",
  },
  section: {
    backgroundColor: "unset",
    zIndex: "initial",
  },
};

export type ChartSettingGoalInputProps = {
  id: string;
  value: number | string;
  onChange: (value: number | string) => void;
  columns?: DatasetColumn[];
  valueField?: string;
};

export const ChartSettingGoalInput = ({
  id,
  value,
  onChange,
  columns = [],
  valueField,
}: ChartSettingGoalInputProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const numberInputRef = useRef<HTMLInputElement>(null);

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

  const handleMenuItemSelect = (selectedValue: string | number) => {
    onChange(selectedValue);
    setIsPopoverOpen(false);
    if (typeof selectedValue === "number") {
      setTimeout(() => {
        numberInputRef.current?.focus();
        numberInputRef.current?.select();
      }, 0);
    }
  };

  const rightSection = hasNumericColumns ? (
    <Menu
      opened={isPopoverOpen}
      onChange={setIsPopoverOpen}
      position="bottom-end"
    >
      <Menu.Target>
        <Box component="span" className={S.chevronTarget}>
          <Icon name="chevrondown" />
        </Box>
      </Menu.Target>
      <Menu.Dropdown miw={320}>
        <Menu.Item onClick={() => handleMenuItemSelect(numericValue)} fw="bold">
          {t`Custom value`}
        </Menu.Item>
        <Menu.Divider />
        {availableColumns.map((column) => (
          <Menu.Item
            key={column.value}
            onClick={() => handleMenuItemSelect(column.value)}
            fw="bold"
          >
            {column.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  ) : null;

  if (isColumnReference) {
    return (
      <Group className={S.root} bg="background_page-primary" align="center">
        <TextInput
          id={id}
          value={selectedColumn?.label || value}
          readOnly
          placeholder={selectedColumn?.label || value}
          rightSection={rightSection}
          rightSectionPointerEvents="all"
          rightSectionWidth={RIGHT_SECTION_WIDTH}
          styles={inputStyles}
          w="100%"
        />
      </Group>
    );
  }

  return (
    <Group className={S.root} bg="background_page-primary" align="center">
      <NumberInput
        ref={numberInputRef}
        id={id}
        value={numericValue}
        onChange={(val) => onChange(val ?? 0)}
        placeholder={t`Enter goal value`}
        rightSection={rightSection}
        rightSectionPointerEvents="all"
        rightSectionWidth={RIGHT_SECTION_WIDTH}
        styles={inputStyles}
        w="100%"
      />
    </Group>
  );
};
