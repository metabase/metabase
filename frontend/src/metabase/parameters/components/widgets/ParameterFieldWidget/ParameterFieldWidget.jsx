import React, { useState } from "react";
import cx from "classnames";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import { deriveFieldOperatorFromParameter } from "metabase/parameters/utils/operators";
import {
  getFilterArgumentFormatOptions,
  isEqualsOperator,
  isFuzzyOperator,
} from "metabase/lib/schema_metadata";
import {
  WidgetRoot,
  Footer,
  UpdateButton,
} from "metabase/parameters/components/widgets/Widget.styled";

import { normalizeValue } from "./normalizeValue";

const propTypes = {
  fields: PropTypes.array.isRequired,
  isEditing: PropTypes.bool.isRequired,
  parameter: PropTypes.object.isRequired,
  parameters: PropTypes.array.isRequired,
  placeholder: PropTypes.string.isRequired,
  setValue: PropTypes.func.isRequired,
  value: PropTypes.string,
  dashboard: PropTypes.object,
};

export default function ParameterFieldWidget({
  value,
  setValue,
  isEditing,
  fields,
  parameter,
  parameters,
  placeholder = t`Enter a value...`,
  dashboard,
}) {
  const [unsavedValue, setUnsavedValue] = useState(() => normalizeValue(value));
  const operator = deriveFieldOperatorFromParameter(parameter);
  const { numFields = 1, multi = false, verboseName } = operator || {};
  const isEqualsOp = isEqualsOperator(operator);
  const disableSearch = operator && isFuzzyOperator(operator);
  const hasValue = Array.isArray(value) ? value.length > 0 : value != null;

  const isValid =
    unsavedValue.every(value => value != null) &&
    (multi || unsavedValue.length === numFields);

  return (
    <WidgetRoot>
      <div className="p1">
        {verboseName && !isEqualsOp && (
          <div className="text-bold mb1">{verboseName}...</div>
        )}

        {_.times(numFields, index => {
          const value = multi ? unsavedValue : [unsavedValue[index]];
          const onValueChange = multi
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
              dashboard={dashboard}
              onChange={onValueChange}
              placeholder={isEditing ? t`Enter a default value…` : undefined}
              fields={fields}
              autoFocus={index === 0}
              multi={multi}
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
          disabled={!isValid}
          onClick={() => {
            setValue(unsavedValue);
          }}
        >
          {hasValue ? t`Update filter` : t`Add filter`}
        </UpdateButton>
      </Footer>
    </WidgetRoot>
  );
}

ParameterFieldWidget.propTypes = propTypes;
