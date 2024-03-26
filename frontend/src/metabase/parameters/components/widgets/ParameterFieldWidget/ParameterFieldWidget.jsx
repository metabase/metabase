import cx from "classnames";
import PropTypes from "prop-types";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import CS from "metabase/css/core/index.css";
import { UpdateFilterButton } from "metabase/parameters/components/UpdateFilterButton";
import {
  WidgetRoot,
  Footer,
} from "metabase/parameters/components/widgets/Widget.styled";
import {
  getFilterArgumentFormatOptions,
  isEqualsOperator,
} from "metabase-lib/v1/operators/utils";
import { deriveFieldOperatorFromParameter } from "metabase-lib/v1/parameters/utils/operators";

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

  const supportsMultipleValues =
    multi && !parameter.hasVariableTemplateTagTarget;

  const isValid =
    unsavedValue.every(value => value != null) &&
    (supportsMultipleValues || unsavedValue.length === numFields);

  return (
    <WidgetRoot>
      <div className={CS.p1}>
        {verboseName && !isEqualsOp && (
          <div className={cx(CS.textBold, CS.mb1)}>{verboseName}...</div>
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
              className={cx(CS.input, numFields - 1 !== index && CS.mb1)}
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
        <UpdateFilterButton
          value={value}
          unsavedValue={unsavedValue}
          defaultValue={parameter.default}
          isValueRequired={parameter.required ?? false}
          isValid={isValid}
          onClick={() => setValue(unsavedValue)}
        />
      </Footer>
    </WidgetRoot>
  );
}

ParameterFieldWidget.propTypes = propTypes;
