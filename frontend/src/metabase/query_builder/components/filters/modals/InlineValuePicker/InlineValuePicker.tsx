import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import Field from "metabase-lib/lib/metadata/Field";

import { ALLOWED_OPERATORS } from "./constants";
import { OperatorSelector, ArgumentSelector } from "./InlineValuePicker.styled";

interface InlineValuePickerProps {
  filter: Filter;
  field: Field;
  handleChange: (newFilter: Filter) => void;
}

export function InlineValuePicker({
  filter,
  field,
  handleChange,
}: InlineValuePickerProps) {
  const changeOperator = useCallback(
    (newOperator: any) => {
      handleChange(filter.setOperator(newOperator));
    },
    [filter, handleChange],
  );

  const changeArguments = useCallback(
    (newArguments: number[]) => {
      handleChange(filter.setArguments(newArguments));
    },
    [filter, handleChange],
  );

  const filterOperators = useMemo(() => {
    return field.filterOperators(filter.operatorName());
  }, [field, filter]);

  return (
    <div data-testid="key-picker" aria-label={field.displayName()}>
      <OperatorSelector
        operator={filter.operatorName() ?? "="}
        operators={filterOperators}
        onOperatorChange={changeOperator}
      />
      <ArgumentSelector
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore: this component doesn't have types or propTypes
        value={filter.arguments()}
        onChange={changeArguments}
        className="input"
        fields={[field]}
        disableSearch
        multi
      />
    </div>
  );
}
