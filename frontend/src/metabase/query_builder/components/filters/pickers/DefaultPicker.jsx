/* eslint-disable react/prop-types */
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "ttag";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";

import { getCurrencySymbol } from "metabase/lib/formatting";

import {
  getFilterArgumentFormatOptions,
  isFuzzyOperator,
} from "metabase-lib/operators/utils";
import { isCurrency } from "metabase-lib/types/utils/isa";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import TextPicker from "./TextPicker";
import SelectPicker from "./SelectPicker";
import NumberPicker from "./NumberPicker";

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

export default function DefaultPicker({
  filter,
  setValue,
  setValues,
  onCommit,
  className,
  minWidth,
  maxWidth,
  checkedColor,
}) {
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

  const key = getColumnKey(dimension.column());
  const columnSettings = visualizationSettings?.column_settings?.[key];

  const fieldMetadata = field?.metadata?.fields[field?.id];
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
        onValuesChange = values => setValues(values);
      } else {
        values = [filter.arguments()[index]];
        onValuesChange = values => setValue(index, values[0]);
      }

      if (operatorField.type === "hidden") {
        return null;
      } else if (operatorField.type === "select") {
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
        while ((sourceField = underlyingField.sourceField())) {
          underlyingField = sourceField;
        }
        return (
          <FieldValuesWidget
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
      limitHeight
      className={cx(className, "PopoverBody--marginBottom")}
    >
      {layout}
    </DefaultPickerContainer>
  );
}

DefaultPicker.propTypes = defaultPickerPropTypes;

const DefaultLayout = ({ className, fieldWidgets }) => (
  <div className={className}>
    {fieldWidgets.map((fieldWidget, index) => (
      <div
        key={index}
        className={index < fieldWidgets.length - 1 ? "mb1" : null}
      >
        {fieldWidget}
      </div>
    ))}
  </div>
);

DefaultLayout.propTypes = defaultLayoutPropTypes;

const BetweenLayout = ({ className, fieldWidgets }) => {
  const [left, right] = fieldWidgets;

  return (
    <BetweenLayoutContainer>
      <BetweenLayoutFieldContainer>{left}</BetweenLayoutFieldContainer>{" "}
      <BetweenLayoutFieldSeparator>{t`and`}</BetweenLayoutFieldSeparator>
      <BetweenLayoutFieldContainer>{right}</BetweenLayoutFieldContainer>
    </BetweenLayoutContainer>
  );
};
