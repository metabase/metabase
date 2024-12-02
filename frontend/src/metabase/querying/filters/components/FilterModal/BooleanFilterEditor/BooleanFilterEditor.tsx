import { useMemo } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { useBooleanOperatorFilter } from "metabase/querying/filters/hooks/use-boolean-operator-filter";
import { Group } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { ToggleButton } from "../DateFilterEditor/DateFilterEditor.styled";
import ItemGrid from "../FilterModalBody/poc.styled";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterTitle, HoverParent } from "../FilterTitle";
import type { FilterEditorProps } from "../types";

export function BooleanFilterEditor({
  query,
  stageIndex,
  column,
  filter,
  isSearching,
  onChange,
}: FilterEditorProps) {
  const columnIcon = useMemo(() => {
    return getColumnIcon(column);
  }, [column]);

  const {
    operator,
    availableOptions,
    values,
    isExpanded,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
  } = useBooleanOperatorFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleOperatorChange = (newOperator: Lib.BooleanFilterOperatorName) => {
    const newValues = getDefaultValues();
    setOperator(newOperator);
    setValues(newValues);
    onChange(getFilterClause(newOperator, newValues));
  };

  const handleValuesChange = (newValues: boolean[]) => {
    const newOperator = "=";
    setOperator(newOperator);
    setValues(newValues);
    onChange(getFilterClause(newOperator, newValues));
  };

  const isTrueChecked = values.length > 0 ? values[0] : false;
  const isFalseChecked = values.length > 0 ? !values[0] : false;

  return (
    <HoverParent data-testid="boolean-filter-editor">
      <ItemGrid
        operatorPicker={
          isExpanded ? (
            <FilterOperatorPicker
              value={operator}
              options={availableOptions}
              onChange={handleOperatorChange}
            />
          ) : undefined
        }
        title={
          <FilterTitle
            query={query}
            stageIndex={stageIndex}
            column={column}
            columnIcon={columnIcon}
            isSearching={isSearching}
          />
        }
      >
        <Group spacing="md">
          <ToggleButton
            radius="xl"
            variant={isTrueChecked ? "filled" : "subtle"}
            aria-selected={isTrueChecked}
            onClick={() => handleValuesChange(isTrueChecked ? [] : [true])}
          >
            {t`True`}
          </ToggleButton>

          <ToggleButton
            radius="xl"
            variant={isFalseChecked ? "filled" : "subtle"}
            aria-selected={isFalseChecked}
            onClick={() => handleValuesChange(isFalseChecked ? [] : [false])}
          >
            {t`False`}
          </ToggleButton>
        </Group>
      </ItemGrid>
    </HoverParent>
  );
}
