import cx from "classnames";
import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import CS from "metabase/css/core/index.css";
import { UpdateFilterButton } from "metabase/parameters/components/UpdateFilterButton";
import {
  getFilterArgumentFormatOptions,
  isEqualsOperator,
} from "metabase-lib/v1/operators/utils";
import { deriveFieldOperatorFromParameter } from "metabase-lib/v1/parameters/utils/operators";

import { Footer, WidgetRoot } from "../Widget";

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
  // prev value is needed to cover a case when some internal change cause an unnecessary update
  // and old parameter value is passed again to the field widget
  // e.g. we changed a value from 1 to 2, then take a pause and 2 is changed back to 1
  const prevValue = usePrevious(value);

  const supportsMultipleValues =
    multi && !parameter.hasVariableTemplateTagTarget;

  useEffect(
    function updateValueOnChange() {
      if (_.isEqual(value, prevValue)) {
        return;
      }

      setUnsavedValue(normalizeValue(value));
    },
    [prevValue, value],
  );

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
              key={`parameter-${parameter.id}-${index}`}
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
