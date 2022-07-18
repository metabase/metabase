import React, { useCallback, useMemo } from "react";
import { t } from "ttag";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Field from "metabase-lib/lib/metadata/Field";

import {
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
  const changeArguments = useCallback(
    (newArguments: (string | number)[]) => {
      handleChange(
        filter.setArguments(newArguments).setOptions(filter.options()),
      );
    },
    [filter, handleChange],
  );

  const hideArgumentSelector = [
    "is-null",
    "not-null",
    "is-empty",
    "not-empty",
  ].includes(filter.operatorName());

  return (
    <>
      <ValuesPickerContainer data-testid="value-picker">
        {!hideArgumentSelector && (
          <ValuesInput
            filter={filter}
            field={field}
            onChange={changeArguments}
          />
        )}
      </ValuesPickerContainer>
    </>
  );
}

interface ValuesInputTypes {
  onChange: (newArguments: (string | number)[]) => void;
  filter: Filter;
  field: Field;
}

function ValuesInput({
  onChange,
  field,
  filter,
}: ValuesInputTypes): JSX.Element {
  const isBetween =
    filter.operatorName() === "between" &&
    filter?.operator()?.fields.length === 2;

  const filterArguments = filter.arguments() ?? [];

  if (!isBetween) {
    return (
      <ArgumentSelector
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore: this component doesn't have types or propTypes
        value={filterArguments}
        color="brand"
        onChange={onChange}
        className="input"
        fields={[field]}
        multi={!!filter?.operator()?.multi}
        showOptionsInPopover
        disableList
      />
    );
  }

  return (
    <BetweenContainer>
      <NumberInput
        placeholder={t`Min`}
        value={filterArguments[0] ?? ""}
        onChange={val => onChange([val, filterArguments[1]])}
        fullWidth
      />
      <NumberSeparator>{t`and`}</NumberSeparator>
      <NumberInput
        placeholder={t`Max`}
        value={filterArguments[1] ?? ""}
        onChange={val => onChange([filterArguments[0], val])}
        fullWidth
      />
    </BetweenContainer>
  );
}
