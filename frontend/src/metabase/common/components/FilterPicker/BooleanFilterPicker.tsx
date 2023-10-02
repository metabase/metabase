import { t } from "ttag";
import { useMemo, useState } from "react";
import { Box, Button, Radio, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import { BackButton } from "./BackButton";
import { Header } from "./Header";
import { Footer } from "./Footer";
import type { FilterPickerWidgetProps } from "./types";

type OptionType = Lib.FilterOperatorName | "true" | "false";

const operatorsToShow = ["=", "is-null", "not-null"];

type Option = {
  name: string;
  type: OptionType;
  operator: Lib.FilterOperator;
  isAdvanced?: boolean;
};

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
    const option = options.find(option => option.type === optionType);
    if (option) {
      onChange(getFilterClause(query, stageIndex, column, option));
    }
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
  return operators
    .flatMap((operator): Option[] => {
      const operatorInfo = Lib.displayInfo(query, stageIndex, operator);
      if (operatorInfo.shortName === "=") {
        return [
          { operator, name: t`True`, type: "true" },
          { operator, name: t`False`, type: "false" },
        ];
      } else if (operatorsToShow.includes(operatorInfo.shortName)) {
        return [
          {
            operator,
            name: operatorInfo.displayName,
            type: operatorInfo.shortName,
            isAdvanced: true,
          },
        ];
      }
      return [];
    })
    .filter(Boolean);
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

  const operatorInfo = Lib.displayInfo(query, stageIndex, filterParts.operator);
  if (operatorInfo.shortName === "=") {
    return filterParts.values[0] ? "true" : "false";
  } else {
    return operatorInfo.shortName;
  }
}

function getFilterClause(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  { type, operator }: Option,
): Lib.ExpressionClause {
  switch (type) {
    case "true":
      return Lib.booleanFilterClause(query, stageIndex, {
        operator,
        column,
        values: [true],
      });
    case "false":
      return Lib.booleanFilterClause(query, stageIndex, {
        operator,
        column,
        values: [false],
      });
    default:
      return Lib.booleanFilterClause(query, stageIndex, {
        operator,
        column,
        values: [],
      });
  }
}
