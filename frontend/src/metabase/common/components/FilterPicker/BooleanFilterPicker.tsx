import { t } from "ttag";
import { useState } from "react";

import { Box, Button, Radio, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { FilterPickerWidgetProps } from "./types";
import { BackButton } from "./BackButton";
import { Header } from "./Header";
import { Footer } from "./Footer";

type BooleanPickerValue = "is-null" | "not-null" | "true" | "false";

const DISPLAY_OPTIONS = [
  { label: t`True`, value: "true", isAdvanced: false },
  { label: t`False`, value: "false", isAdvanced: false },
  { label: t`Empty`, value: "is-null", isAdvanced: true },
  { label: t`Not empty`, value: "not-null", isAdvanced: true },
];

export function BooleanFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onBack,
  onChange,
}: FilterPickerWidgetProps) {
  const columnName = Lib.displayInfo(query, stageIndex, column).longDisplayName;
  const filterParts = filter
    ? Lib.booleanFilterParts(query, stageIndex, filter)
    : null;

  const [currentValue, setCurrentValue] = useState<BooleanPickerValue>(
    getBooleanPickerValue(filterParts),
  );

  const displayOption =
    DISPLAY_OPTIONS.find(({ value }) => value === currentValue) ??
    DISPLAY_OPTIONS[0];

  const [expanded, setExpanded] = useState<boolean>(displayOption.isAdvanced);

  const visibleOptions = expanded
    ? DISPLAY_OPTIONS
    : DISPLAY_OPTIONS.filter(({ isAdvanced }) => !isAdvanced);

  const handleChange = (value: BooleanPickerValue) => {
    const filter = getFilter(value, column);
    onChange(filter);
  };

  return (
    <>
      <Header>
        <BackButton onClick={onBack}>{columnName}</BackButton>
      </Header>
      <Stack p="md">
        <Radio.Group
          value={currentValue}
          onChange={newValue => setCurrentValue(newValue as BooleanPickerValue)}
        >
          {visibleOptions.map(({ value, label }) => (
            <Radio key={value} value={value} label={label} pb={6} size="xs" />
          ))}
        </Radio.Group>
        {!expanded && (
          <Button variant="subtle" onClick={() => setExpanded(prev => !prev)}>
            {t`More options`}
          </Button>
        )}
      </Stack>
      <Footer>
        <Box />
        <Button onClick={() => handleChange(currentValue)}>
          {filter ? t`Update filter` : t`Add filter`}
        </Button>
      </Footer>
    </>
  );
}

// we have to make this kinda verbose to make typescript happy
function getBooleanPickerValue(
  filterParts: Lib.BooleanFilterParts | null,
): BooleanPickerValue {
  if (filterParts === null) {
    return "true";
  }

  if (filterParts.operator === "=" && filterParts.values?.length === 1) {
    return filterParts.values[0] ? "true" : "false";
  }

  if (
    filterParts.operator === "is-null" ||
    filterParts.operator === "not-null"
  ) {
    return filterParts.operator;
  }

  return "true";
}

function getFilter(
  value: BooleanPickerValue,
  column: Lib.ColumnMetadata,
): Lib.ExpressionClause {
  switch (value) {
    case "is-null":
      return Lib.booleanFilterClause({
        operator: "is-null",
        column,
        values: [],
      });
    case "not-null":
      return Lib.booleanFilterClause({
        operator: "not-null",
        column,
        values: [],
      });
    case "true":
      return Lib.booleanFilterClause({ operator: "=", column, values: [true] });
    case "false":
      return Lib.booleanFilterClause({
        operator: "=",
        column,
        values: [false],
      });
  }
}
