import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "ttag";
import type { ReactElement } from "react";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import type { DatasetColumn, FieldId, RowValue } from "metabase-types/api";

import { getCurrencySymbol } from "metabase/lib/formatting";
import type Filter from "metabase-lib/queries/structured/Filter";

import {
  getFilterArgumentFormatOptions,
  isFuzzyOperator,
} from "metabase-lib/operators/utils";
import { isCurrency } from "metabase-lib/types/utils/isa";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import TextPicker from "../TextPicker";
import SelectPicker from "../SelectPicker";
import NumberPicker from "../NumberPicker";

import {
  BetweenLayoutContainer,
  BetweenLayoutFieldSeparator,
  BetweenLayoutFieldContainer,
  DefaultPickerContainer,
} from "./DefaultPicker.styled";

const defaultPickerPropTypes = {
  filter: PropTypes.array,
  setValue: PropTypes.func,
  setValues: PropTypes.func,
  onCommit: PropTypes.func,
  className: PropTypes.string,
  minWidth: PropTypes.number,
  maxWidth: PropTypes.number,
  checkedColor: PropTypes.string,
};

const defaultLayoutPropTypes = {
  className: PropTypes.string,
  fieldWidgets: PropTypes.array,
};

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

  const visualizationSettings = filter?.query()?.question()?.settings();

  const key = dimension?.column?.()
    ? getColumnKey(dimension.column() as DatasetColumn)
    : "";

  const columnSettings = visualizationSettings?.column_settings?.[key];

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
            className="input"
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
      className={cx(className, "PopoverBody--marginBottom")}
    >
      {layout}
    </DefaultPickerContainer>
  );
}

DefaultPicker.propTypes = defaultPickerPropTypes;

const DefaultLayout = ({
  fieldWidgets,
}: {
  fieldWidgets: (ReactElement | null)[];
}) => (
  <div>
    {fieldWidgets.map((fieldWidget, index) => (
      <div key={index} className={index < fieldWidgets.length - 1 ? "mb1" : ""}>
        {fieldWidget}
      </div>
    ))}
  </div>
);

DefaultLayout.propTypes = defaultLayoutPropTypes;

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
