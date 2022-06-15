import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import Field from "metabase-lib/lib/metadata/Field";

import { ALLOWED_OPERATORS } from "./constants";
import { OperatorSelector, ArgumentSelector } from "./InlineKeyPicker.styled";

interface InlineKeyPickerProps {
  filter: Filter;
  field: Field;
  handleChange: (newFilter: Filter) => void;
}

export function InlineKeyPicker({
  filter,
  field,
  handleChange,
}: InlineKeyPickerProps) {
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
    const operators = field.filterOperators(filter.operatorName());
    return operators.filter((operator: any) =>
      ALLOWED_OPERATORS.includes(operator.name),
    );
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
        placeholder={t`Enter IDs`}
        fields={[field]}
        multi
      />
    </div>
  );
}
