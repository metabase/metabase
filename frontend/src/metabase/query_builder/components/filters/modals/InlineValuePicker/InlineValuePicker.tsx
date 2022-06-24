import React, { useCallback, useMemo } from "react";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import Field from "metabase-lib/lib/metadata/Field";
import { t } from "ttag";

import {
  OperatorSelector,
  ArgumentSelector,
  ValuesPickerContainer,
  BetweenContainer,
  NumberInput,
  NumberSeparator,
} from "./InlineValuePicker.styled";

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

  const filterOperators = field.filterOperators(filter.operatorName());
  const hideArgumentSelector = [
    "is-null",
    "not-null",
    "empty",
    "not-empty",
  ].includes(filter.operatorName());

  const isBetween =
    filter.operatorName() === "between" &&
    filter?.operator()?.fields.length === 2;
  const filterArguments = filter.arguments() ?? [];

  return (
    <ValuesPickerContainer
      data-testid="value-picker"
      aria-label={field.displayName()}
    >
      <OperatorSelector
        operator={filter.operatorName() ?? "="}
        operators={filterOperators}
        onOperatorChange={changeOperator}
      />
      {!hideArgumentSelector && !isBetween && (
        <ArgumentSelector
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore: this component doesn't have types or propTypes
          value={filterArguments}
          onChange={changeArguments}
          className="input"
          fields={[field]}
          multi={!!filter?.operator()?.multi}
          showOptionsInPopover
        />
      )}
      {isBetween && (
        <BetweenContainer>
          <NumberInput
            placeholder={t`min`}
            value={filterArguments[0] ?? ""}
            onChange={e =>
              changeArguments([e.target.value, filterArguments[1]])
            }
            fullWidth
          />
          <NumberSeparator>{t`and`}</NumberSeparator>
          <NumberInput
            placeholder={t`max`}
            value={filterArguments[1] ?? ""}
            onChange={e =>
              changeArguments([filterArguments[0], e.target.value])
            }
            fullWidth
          />
        </BetweenContainer>
      )}
    </ValuesPickerContainer>
  );
}
