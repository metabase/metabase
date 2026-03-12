import { msgid, ngettext } from "ttag";

import { formatValue } from "metabase/lib/formatting";
import * as Lib from "metabase-lib";
import Field from "metabase-lib/v1/metadata/Field";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  getFields,
  hasFields,
} from "metabase-lib/v1/parameters/utils/parameter-fields";
import {
  getParameterType,
  isDateParameter,
  isFieldFilterParameter,
  isTemporalUnitParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import type {
  FormattingSettings,
  ParameterValue,
  RowValue,
} from "metabase-types/api";

import { formatDateValue } from "./date-formatting";

function inferValueType(parameter: UiParameter) {
  const type = getParameterType(parameter);
  if (type === "number") {
    return "type/Number";
  }

  return "type/Text";
}

function formatWithInferredType(value: any, parameter: UiParameter) {
  const inferredType = inferValueType(parameter);
  const column = {
    base_type: inferredType,
  };
  return formatValue(value, {
    column,
    maximumFractionDigits: 20,
  });
}

export function formatParameterValue(
  rawValue: string | number | number[] | ParameterValue,
  parameter: UiParameter,
  formattingSettings?: FormattingSettings,
) {
  if (Array.isArray(rawValue) && rawValue.length > 1) {
    return renderNumberOfSelections(rawValue.length);
  }

  const value: RowValue = Array.isArray(rawValue) ? rawValue[0] : rawValue;

  if (isDateParameter(parameter)) {
    return formatDateValue(
      parameter,
      String(value),
      formattingSettings?.["type/Temporal"],
    );
  }

  if (isTemporalUnitParameter(parameter)) {
    return typeof value === "string" ? Lib.describeTemporalUnit(value) : null;
  }

  if (isFieldFilterParameter(parameter)) {
    // skip formatting field filter parameters mapped to native query variables
    if (parameter.hasVariableTemplateTagTarget) {
      return String(value);
    }

    // format using the parameter's first targeted field
    if (hasFields(parameter)) {
      const fields = getFields(parameter);
      const [firstField] = fields;
      // when a parameter targets multiple fields we won't know
      // which parameter the value is associated with, so we take
      // the first field for remapping
      const remap = Field.remappedField(fields) != null;
      return formatValue(value as string, {
        column: firstField,
        maximumFractionDigits: 20,
        remap,
      });
    }
  }

  // infer type information from parameter type
  return formatWithInferredType(value, parameter);
}

export function renderNumberOfSelections(numberOfSelections: number) {
  return ngettext(
    msgid`${numberOfSelections} selection`,
    `${numberOfSelections} selections`,
    numberOfSelections,
  );
}
