import { t } from "ttag";
import { useMemo, useState } from "react";
import { Box, Button, Radio, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import { BackButton } from "./BackButton";
import { Header } from "./Header";
import { Footer } from "./Footer";
import type { FilterPickerWidgetProps } from "./types";

type OptionType = "true" | "false" | "empty" | "not-empty";

type Option = {
  name: string;
  type: OptionType;
  operator: Lib.FilterOperatorName;
  isAdvanced?: boolean;
};

const OPTIONS: Option[] = [
  {
    name: t`True`,
    type: "true",
    operator: "=",
  },
  {
    name: t`False`,
    type: "false",
    operator: "=",
  },
  {
    name: t`Empty`,
    type: "empty",
    operator: "is-null",
    isAdvanced: true,
  },
  {
    name: t`Not empty`,
    type: "not-empty",
    operator: "not-null",
    isAdvanced: true,
  },
];

export function BooleanFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onBack,
  onChange,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(() => {
    return Lib.displayInfo(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const options = useMemo(() => {
    return getOptions(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const [optionType, setOptionType] = useState(() =>
    getOptionType(query, stageIndex, filter),
  );

  const [isExpanded, setIsExpanded] = useState(() =>
    options.some(option => option.type === optionType && option.isAdvanced),
  );

  const visibleOptions = useMemo(() => {
    return isExpanded ? options : options.filter(option => !option.isAdvanced);
  }, [options, isExpanded]);

  const handleOptionChange = (type: string) => {
    setOptionType(type as OptionType);
  };

  const handleSubmit = () => {
    onChange(getFilterClause(column, optionType));
  };

  return (
    <>
      <Header>
        <BackButton onClick={onBack}>{columnInfo.displayName}</BackButton>
      </Header>
      <Stack p="md">
        <Radio.Group value={optionType} onChange={handleOptionChange}>
          {visibleOptions.map(option => (
            <Radio
              key={option.type}
              value={option.type}
              label={option.name}
              pb={6}
              size="xs"
            />
          ))}
        </Radio.Group>
        {!isExpanded && (
          <Button variant="subtle" onClick={() => setIsExpanded(true)}>
            {t`More options`}
          </Button>
        )}
      </Stack>
      <Footer>
        <Box />
        <Button onClick={handleSubmit}>
          {filter ? t`Update filter` : t`Add filter`}
        </Button>
      </Footer>
    </>
  );
}

function getOptions(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): Option[] {
  const operators = Lib.filterableColumnOperators(column);
  const operatorNames = operators.map(
    operator => Lib.displayInfo(query, stageIndex, operator).shortName,
  );
  return OPTIONS.filter(option => operatorNames.includes(option.operator));
}

function getOptionType(
  query: Lib.Query,
  stageIndex: number,
  filterClause?: Lib.FilterClause,
): OptionType {
  if (!filterClause) {
    return "true";
  }

  const filterParts = Lib.booleanFilterParts(query, stageIndex, filterClause);
  if (!filterParts) {
    return "true";
  }

  switch (filterParts.operator) {
    case "=":
      return filterParts.values[0] ? "true" : "false";
    case "is-null":
      return "empty";
    case "not-null":
      return "not-empty";
    default:
      return "true";
  }
}

function getFilterClause(
  column: Lib.ColumnMetadata,
  filterType: OptionType,
): Lib.ExpressionClause {
  switch (filterType) {
    case "true":
      return Lib.booleanFilterClause({
        operator: "=",
        column,
        values: [true],
      });
    case "false":
      return Lib.booleanFilterClause({
        operator: "=",
        column,
        values: [false],
      });
    case "empty":
      return Lib.booleanFilterClause({
        operator: "is-null",
        column,
        values: [],
      });
    case "not-empty":
      return Lib.booleanFilterClause({
        operator: "not-null",
        column,
        values: [],
      });
  }
}
