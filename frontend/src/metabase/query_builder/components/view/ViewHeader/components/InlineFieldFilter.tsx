import { useState } from "react";
import { t } from "ttag";

import { DateShortcutPicker } from "metabase/querying/filters/components/DatePicker/DateShortcutPicker";
import type { FilterChangeOpts } from "metabase/querying/filters/components/FilterPicker/types";
import {
  DATE_PICKER_OPERATORS,
  DATE_PICKER_SHORTCUTS,
} from "metabase/querying/filters/constants";
import { useDateFilter } from "metabase/querying/filters/hooks/use-date-filter";
import { 
  Flex, 
  Select, 
  Text,
  TextInput
} from "metabase/ui";
import * as Lib from "metabase-lib";

interface InlineFieldFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  onChange: (filter: Lib.ExpressionClause, opts: FilterChangeOpts) => void;
}

export function InlineFieldFilter({
  query,
  stageIndex,
  column,
  onChange,
}: InlineFieldFilterProps) {
  const [operator, setOperator] = useState<string>("");
  const [textValue, setTextValue] = useState("");

  // Get column type info
  const isStringColumn = Lib.isStringOrStringLike(column);
  const isNumericColumn = Lib.isNumeric(column);
  const isDateOrDateTimeColumn = Lib.isDateOrDateTime(column);

  // Always call the date filter hook to avoid conditional hook calls
  const dateFilter = useDateFilter({
    query,
    stageIndex,
    column,
    filter: undefined,
  });

  // Handle specialized filter widgets for specific column types
  if (isDateOrDateTimeColumn) {
    const handleDateShortcutChange = (value: any) => {
      const filterClause = dateFilter.getFilterClause(value);
      if (filterClause) {
        onChange(filterClause, { run: true });
      }
    };

    const handleDateTypeSelect = (_type: any) => {
      // For now, just handle the shortcuts - could expand to handle specific/relative types later
      // Future enhancement: handle specific date ranges, relative dates, etc.
    };

    return (
      <DateShortcutPicker
        availableOperators={DATE_PICKER_OPERATORS}
        availableShortcuts={DATE_PICKER_SHORTCUTS}
        onChange={handleDateShortcutChange}
        onSelectType={handleDateTypeSelect}
      />
    );
  }

  // For string and numeric columns, use the generic interface
  const getOperatorOptions = () => {
    if (isStringColumn) {
      return [
        { operator: "=", name: t`is` },
        { operator: "!=", name: t`is not` },
        { operator: "contains", name: t`contains` },
        { operator: "does-not-contain", name: t`does not contain` },
        { operator: "starts-with", name: t`starts with` },
        { operator: "ends-with", name: t`ends with` },
        { operator: "is-null", name: t`is empty` },
        { operator: "not-null", name: t`is not empty` },
      ];
    } else if (isNumericColumn) {
      return [
        { operator: "=", name: t`equals` },
        { operator: "!=", name: t`does not equal` },
        { operator: ">", name: t`greater than` },
        { operator: "<", name: t`less than` },
        { operator: ">=", name: t`greater than or equal to` },
        { operator: "<=", name: t`less than or equal to` },
        { operator: "is-null", name: t`is empty` },
        { operator: "not-null", name: t`is not empty` },
      ];
    } else {
      return [
        { operator: "=", name: t`is` },
        { operator: "!=", name: t`is not` },
        { operator: "is-null", name: t`is empty` },
        { operator: "not-null", name: t`is not empty` },
      ];
    }
  };

  const operatorOptions = getOperatorOptions();

  const handleOperatorChange = (newOperator: string | null) => {
    if (newOperator) {
      setOperator(newOperator);
    }
  };

  const applyFilter = () => {
    if (!operator) return;

    try {
      let filterClause = null;

      // Handle null/not-null operations (no value needed)
      if (operator === "is-null" || operator === "not-null") {
        filterClause = Lib.defaultFilterClause({ 
          operator: operator as any, 
          column 
        });
      } 
      // Handle operations that need values
      else if (textValue.trim()) {
        if (isStringColumn) {
          filterClause = Lib.stringFilterClause({
            operator: operator as any,
            column,
            values: [textValue.trim()],
            options: { caseSensitive: false }
          });
        } else if (isNumericColumn) {
          const numValue = parseFloat(textValue);
          if (!isNaN(numValue)) {
            filterClause = Lib.numberFilterClause({
              operator: operator as any,
              column,
              values: [numValue],
            });
          }
        } else {
          filterClause = Lib.defaultFilterClause({ 
            operator: operator as any, 
            column 
          });
        }
      }

      if (filterClause) {
        onChange(filterClause, { run: true });
      }
    } catch (error) {
      console.error("Error applying filter:", error);
      // Show a user-friendly message instead of crashing
    }
  };

  const handleTextChange = (value: string) => {
    setTextValue(value);
  };

  const handleTextKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      applyFilter();
    }
  };

  const needsValue = operator && operator !== "is-null" && operator !== "not-null";

  return (
    <Flex align="center" gap="md" wrap="wrap">
      <Select
        placeholder={t`Choose filter...`}
        value={operator}
        onChange={handleOperatorChange}
        data={operatorOptions.map(option => ({ 
          label: option.name, 
          value: option.operator 
        }))}
        style={{ minWidth: '120px' }}
      />
      
      {needsValue && (
        <TextInput
          placeholder={isNumericColumn ? t`Enter number...` : t`Enter text...`}
          value={textValue}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyPress={handleTextKeyPress}
          onBlur={applyFilter}
          style={{ minWidth: '200px' }}
        />
      )}

      {!needsValue && operator && (
        <Text size="sm" c="dimmed">
          {t`Filter will be applied automatically`}
        </Text>
      )}
    </Flex>
  );
} 