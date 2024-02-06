import { useState } from "react";
import cx from "classnames";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import {
  WidgetRoot,
  Footer,
  UpdateButton,
} from "metabase/parameters/components/widgets/Widget.styled";
import { deriveFieldOperatorFromParameter } from "metabase-lib/parameters/utils/operators";
import {
  getFilterArgumentFormatOptions,
  isEqualsOperator,
  isFuzzyOperator,
} from "metabase-lib/operators/utils";

import { getUpdateButtonProps } from "../getUpdateButtonProps";
import { normalizeValue } from "./normalizeValue";

const propTypes = {
  fields: PropTypes.array.isRequired,
  isEditing: PropTypes.bool.isRequired,
  parameter: PropTypes.object.isRequired,
  parameters: PropTypes.array.isRequired,
  setValue: PropTypes.func.isRequired,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.arrayOf(PropTypes.string),
  ]),
  question: PropTypes.object,
  dashboard: PropTypes.object,
};

export default function ParameterFieldWidget({
  value,
  setValue,
  isEditing,
  fields,
  parameter,
  parameters,
  question,
  dashboard,
}) {
  const [unsavedValue, setUnsavedValue] = useState(() => normalizeValue(value));
  const operator = deriveFieldOperatorFromParameter(parameter);
  const { numFields = 1, multi = false, verboseName } = operator || {};
  const isEqualsOp = isEqualsOperator(operator);
  const disableSearch = operator && isFuzzyOperator(operator);

  const supportsMultipleValues =
    multi && !parameter.hasVariableTemplateTagTarget;

  const isValid =
    unsavedValue.every(value => value != null) &&
    (supportsMultipleValues || unsavedValue.length === numFields);

  const { label: buttonLabel, disabled: buttonDisabled } = getUpdateButtonProps(
    value,
    unsavedValue,
    parameter.default,
    parameter.required,
  );

  return (
    <WidgetRoot>
      <div className="p1">
        {verboseName && !isEqualsOp && (
          <div className="text-bold mb1">{verboseName}...</div>
        )}

        {_.times(numFields, index => {
          const value = supportsMultipleValues
            ? unsavedValue
            : [unsavedValue[index]];
          const onValueChange = supportsMultipleValues
            ? newValues => setUnsavedValue(newValues)
            : ([value]) => {
                const newValues = [...unsavedValue];
                newValues[index] = value;
                setUnsavedValue(newValues);
              };
          return (
            <FieldValuesWidget
              key={index}
              className={cx("input", numFields - 1 !== index && "mb1")}
              value={value}
              parameter={parameter}
              parameters={parameters}
              question={question}
              dashboard={dashboard}
              onChange={onValueChange}
              placeholder={isEditing ? t`Enter a default value…` : undefined}
              fields={fields}
              autoFocus={index === 0}
              multi={supportsMultipleValues}
              disableSearch={disableSearch}
              formatOptions={
                operator && getFilterArgumentFormatOptions(operator, index)
              }
              color="brand"
              minWidth={300}
              maxWidth={400}
            />
          );
        })}
      </div>
      <Footer>
        <UpdateButton
          disabled={buttonDisabled || !isValid}
          onClick={() => {
            setValue(unsavedValue);
          }}
        >
          {buttonLabel}
        </UpdateButton>
      </Footer>
    </WidgetRoot>
  );
}

ParameterFieldWidget.propTypes = propTypes;
