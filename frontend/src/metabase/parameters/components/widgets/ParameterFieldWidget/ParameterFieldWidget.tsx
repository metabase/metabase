import cx from "classnames";
import { type FormEvent, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { UpdateFilterButton } from "metabase/parameters/components/UpdateFilterButton";
import { Box } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import {
  getFilterArgumentFormatOptions,
  isEqualsOperator,
} from "metabase-lib/v1/operators/utils";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { deriveFieldOperatorFromParameter } from "metabase-lib/v1/parameters/utils/operators";
import {
  getIsMultiSelect,
  hasValue,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type { CardId, DashboardId, RowValue } from "metabase-types/api";

import { Footer } from "../Widget";
import { MIN_WIDTH } from "../constants";

import FieldValuesWidget from "./FieldValuesWidget";
import { normalizeValue } from "./normalizeValue";

interface ParameterFieldWidgetProps {
  fields: Field[];
  isEditing?: boolean;
  parameter: UiParameter;
  parameters?: UiParameter[];
  setValue: (value: RowValue[]) => void;
  value?: string | string[];
  cardId?: CardId;
  dashboardId?: DashboardId;
}

export function ParameterFieldWidget({
  value,
  setValue,
  isEditing,
  fields,
  parameter,
  parameters,
  cardId,
  dashboardId,
}: ParameterFieldWidgetProps) {
  const [unsavedValue, setUnsavedValue] = useState<RowValue[]>(() =>
    normalizeValue(value),
  );
  const operator = deriveFieldOperatorFromParameter(parameter);
  const { numFields = 1, multi = false, verboseName } = operator || {};
  const isEqualsOp = isEqualsOperator(operator);

  const supportsMultipleValues = multi && getIsMultiSelect(parameter);

  const isValid =
    unsavedValue.every((value) => value != null) &&
    (supportsMultipleValues || unsavedValue.length <= numFields);
  const isEmpty = unsavedValue.length === 0;
  const isRequired = parameter?.required;

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isValid) {
      return;
    }

    if (isRequired && isEmpty) {
      if (hasValue(parameter.default)) {
        setValue(parameter.default as RowValue[]);
      }
      return;
    }

    setValue(unsavedValue);
  };

  return (
    <Box component="form" miw={MIN_WIDTH} onSubmit={handleFormSubmit}>
      <div className={CS.p1}>
        {verboseName && !isEqualsOp && (
          <div className={cx(CS.textBold, CS.mb1)}>{verboseName}...</div>
        )}

        {_.times(numFields, (index) => {
          const value = supportsMultipleValues
            ? unsavedValue
            : [unsavedValue[index]];
          const onValueChange = supportsMultipleValues
            ? (newValues: RowValue[]) => setUnsavedValue(newValues)
            : ([value]: RowValue[]) => {
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
              cardId={cardId}
              dashboardId={dashboardId}
              onChange={onValueChange}
              placeholder={isEditing ? t`Enter a default value…` : undefined}
              fields={fields}
              autoFocus={index === 0}
              multi={supportsMultipleValues}
              formatOptions={{
                ...(operator &&
                  getFilterArgumentFormatOptions(operator, index)),
                ...fields?.[0]?.settings,
              }}
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
        />
      </Footer>
    </Box>
  );
}
