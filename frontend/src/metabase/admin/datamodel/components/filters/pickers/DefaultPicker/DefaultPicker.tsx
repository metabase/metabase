import cx from "classnames";
import type { ReactElement } from "react";
import { t } from "ttag";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import PopoverS from "metabase/components/Popover/Popover.module.css";
import CS from "metabase/css/core/index.css";
import { getCurrencySymbol } from "metabase/lib/formatting";
import {
  getFilterArgumentFormatOptions,
  isFuzzyOperator,
} from "metabase-lib/v1/operators/utils";
import type Filter from "metabase-lib/v1/queries/structured/Filter";
import { getColumnSettings } from "metabase-lib/v1/queries/utils/column-key";
import { isCurrency } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, FieldId, RowValue } from "metabase-types/api";

import NumberPicker from "../NumberPicker";
import SelectPicker from "../SelectPicker";
import TextPicker from "../TextPicker";

import {
  BetweenLayoutContainer,
  BetweenLayoutFieldSeparator,
  BetweenLayoutFieldContainer,
  DefaultPickerContainer,
} from "./DefaultPicker.styled";

export interface DefaultPickerProps {
  filter: Filter;
  setValue: (index: number, value: RowValue) => void;
  setValues: (values: RowValue[]) => void;
  onCommit: (filter: Filter) => void;
  className?: string;
  minWidth?: number | null;
  maxWidth?: number | null;
  checkedColor?: string;
}
export function DefaultPicker({
  filter,
  setValue,
  setValues,
  onCommit,
  className,
  minWidth,
  maxWidth,
  checkedColor,
}: DefaultPickerProps) {
  const operator = filter.operator();
  if (!operator) {
    return <div className={className} />;
  }

  const dimension = filter.dimension();
  const field = dimension && dimension.field();
  const operatorFields = operator.fields || [];
  const disableSearch = isFuzzyOperator(operator);

  const isBetweenLayout =
    operator.name === "between" && operatorFields.length === 2;

  const visualizationSettings = filter
    ?.legacyQuery({ useStructuredQuery: true })
    ?.question()
    ?.settings();

  const column = dimension?.column?.();
  const columnSettings =
    column && getColumnSettings(visualizationSettings, column as DatasetColumn);

  const fieldMetadata = field?.metadata?.fields[field?.id as FieldId];
  const fieldSettings = {
    ...(fieldMetadata?.settings ?? {}),
    ...(columnSettings ?? {}),
  };

  const currencyPrefix =
    isCurrency(field) || fieldSettings?.currency
      ? getCurrencySymbol(fieldSettings?.currency)
      : null;

  const fieldWidgets = operatorFields
    .map((operatorField, index) => {
      const placeholder =
        (operator.placeholders && operator.placeholders[index]) || undefined;

      let values, onValuesChange;
      if (operator.multi) {
        values = filter.arguments();
        onValuesChange = (values: RowValue[]) => setValues(values);
      } else {
        values = [filter.arguments()[index]];
        onValuesChange = (values: RowValue[]) => setValue(index, values[0]);
      }

      if (operatorField.type === "hidden") {
        return null;
      } else if (operatorField.type === "select") {
        // unclear, but this may be a dead code path
        return (
          <SelectPicker
            key={index}
            options={operatorField.values}
            values={values}
            onValuesChange={onValuesChange}
            placeholder={placeholder}
            multi={operator.multi}
            onCommit={onCommit}
          />
        );
      } else if (field?.id !== null && !isBetweenLayout) {
        // get the underling field if the query is nested
        let underlyingField = field;
        let sourceField;
        while ((sourceField = underlyingField?.sourceField())) {
          underlyingField = sourceField;
        }
        return (
          <FieldValuesWidget
            key={index}
            value={values}
            onChange={onValuesChange}
            multi={operator.multi}
            placeholder={placeholder}
            fields={underlyingField ? [underlyingField] : []}
            prefix={currencyPrefix}
            disablePKRemappingForSearch={true}
            autoFocus={index === 0}
            alwaysShowOptions={operator.fields.length === 1}
            formatOptions={getFilterArgumentFormatOptions(operator, index)}
            disableSearch={disableSearch}
            minWidth={minWidth}
            maxWidth={maxWidth}
            checkedColor={checkedColor}
          />
        );
      } else if (operatorField.type === "text") {
        return (
          <TextPicker
            key={index}
            autoFocus={index === 0}
            values={values}
            onValuesChange={onValuesChange}
            placeholder={placeholder}
            multi={operator.multi}
            onCommit={onCommit}
          />
        );
      } else if (operatorField.type === "number") {
        return (
          <NumberPicker
            key={index}
            autoFocus={index === 0}
            values={values}
            onValuesChange={onValuesChange}
            placeholder={placeholder}
            prefix={currencyPrefix}
            multi={operator.multi}
            onCommit={onCommit}
          />
        );
      }
      return null;
    })
    .filter(f => f);

  let layout = null;

  if (isBetweenLayout) {
    layout = <BetweenLayout fieldWidgets={fieldWidgets} />;
  } else if (fieldWidgets.length > 0) {
    layout = <DefaultLayout fieldWidgets={fieldWidgets} />;
  }

  return (
    <DefaultPickerContainer
      data-testid="default-picker-container"
      className={cx(className, PopoverS.PopoverBodyMarginBottom)}
    >
      {layout}
    </DefaultPickerContainer>
  );
}

const DefaultLayout = ({
  fieldWidgets,
}: {
  fieldWidgets: (ReactElement | null)[];
}) => (
  <div>
    {fieldWidgets.map((fieldWidget, index) => (
      <div
        key={index}
        className={index < fieldWidgets.length - 1 ? CS.mb1 : ""}
      >
        {fieldWidget}
      </div>
    ))}
  </div>
);

const BetweenLayout = ({
  fieldWidgets,
}: {
  fieldWidgets: (ReactElement | null)[];
}) => {
  const [left, right] = fieldWidgets;

  return (
    <BetweenLayoutContainer>
      <BetweenLayoutFieldContainer>{left}</BetweenLayoutFieldContainer>{" "}
      <BetweenLayoutFieldSeparator>{t`and`}</BetweenLayoutFieldSeparator>
      <BetweenLayoutFieldContainer>{right}</BetweenLayoutFieldContainer>
    </BetweenLayoutContainer>
  );
};
