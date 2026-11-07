import { t } from "ttag";
import _ from "underscore";

import type { ComboboxItem } from "metabase/ui";
import { isTransientId } from "metabase/utils/dashboard";
import { stripId } from "metabase/utils/formatting";
import * as Lib from "metabase-lib";
import {
  getFieldTypeInfo,
  hasRemappedFields,
} from "metabase-lib/v1/parameters/utils/parameter-fields";
import {
  canListParameterValues,
  canSearchParameterValues,
  getSourceType,
} from "metabase-lib/v1/parameters/utils/parameter-source";
import {
  isIdParameter,
  isNumberParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import type {
  CardId,
  DashboardId,
  FieldValue,
  Parameter,
  ParameterFieldInfo,
  RowValue,
} from "metabase-types/api";

import type { ValuesMode } from "./types";

export function canUseParameterEndpoints(parameter?: Parameter) {
  return parameter != null;
}

export function canUseCardEndpoints(cardId?: CardId) {
  return cardId != null;
}

export function canUseDashboardEndpoints(dashboardId?: DashboardId) {
  return dashboardId != null && !isTransientId(dashboardId);
}

export function shouldList(parameter: Parameter) {
  return canListParameterValues(parameter);
}

function getNonSearchableTokenFieldPlaceholder(parameter: Parameter) {
  if (isIdParameter(parameter)) {
    return t`Enter an ID`;
  } else if (isNumberParameter(parameter)) {
    return t`Enter a number`;
  }
  return t`Enter some text`;
}

function getSearchableTokenFieldPlaceholder(
  parameter: Parameter,
  fields: ParameterFieldInfo[],
) {
  const names = new Set(fields.map((field) => stripId(field.display_name)));

  if (
    names.size !== 1 ||
    getSourceType(parameter) != null ||
    hasRemappedFields(fields)
  ) {
    return t`Search`;
  }

  const [name] = names;
  return t`Search by ${name}`;
}

export function hasList({
  parameter,
  options,
}: {
  parameter: Parameter;
  options: FieldValue[];
}) {
  return shouldList(parameter) && !_.isEmpty(options);
}

// if this search is just an extension of the previous search, and the previous search
// wasn't truncated, then we don't need to do another search because TypeaheadListing
// will filter the previous result client-side
export function isExtensionOfPreviousSearch(
  value: string,
  lastValue: string,
  options: FieldValue[],
  maxResults: number,
) {
  return (
    lastValue &&
    value.slice(0, lastValue.length) === lastValue &&
    options.length < maxResults
  );
}

export function isSearchable({
  parameter,
  valuesMode,
}: {
  parameter: Parameter;
  valuesMode?: ValuesMode;
}) {
  return valuesMode === "search" || canSearchParameterValues(parameter);
}

export function getTokenFieldPlaceholder({
  fields,
  parameter,
  placeholder,
  options,
  valuesMode,
}: {
  fields: ParameterFieldInfo[];
  parameter: Parameter;
  placeholder?: string;
  options: FieldValue[];
  valuesMode: ValuesMode;
}) {
  if (placeholder) {
    return placeholder;
  } else if (hasList({ parameter, options })) {
    return t`Search the list`;
  } else if (isSearchable({ parameter, valuesMode })) {
    return getSearchableTokenFieldPlaceholder(parameter, fields);
  } else {
    return getNonSearchableTokenFieldPlaceholder(parameter);
  }
}

export function getValuesMode(parameter: Parameter): ValuesMode {
  if (isSearchable({ parameter })) {
    return "search";
  } else if (shouldList(parameter)) {
    return "list";
  }
  return "none";
}

export function isNumeric(parameter: Parameter, fields: ParameterFieldInfo[]) {
  return (
    isNumberParameter(parameter) ||
    (fields.length > 0 &&
      fields.every((field) => Lib.isNumeric(getFieldTypeInfo(field))))
  );
}

export function getValue(option: FieldValue): RowValue {
  if (Array.isArray(option)) {
    return option[0];
  }
  return option;
}

export function getLabel(option: FieldValue): string | undefined {
  if (Array.isArray(option)) {
    return option[1];
  }
  return undefined;
}

export function getOption(
  option: string | number | FieldValue,
): ComboboxItem | null {
  const value = Array.isArray(option) ? getValue(option) : option;
  const label = Array.isArray(option) ? getLabel(option) : undefined;
  if (value == null) {
    return null;
  }

  return { value: String(value), label: String(label ?? value) };
}

export function parseStringValue(value: unknown): string | null {
  const trimmedValue = trim(value);
  if (trimmedValue === "") {
    return null;
  }

  return trimmedValue;
}

function trim(value: unknown) {
  return String(value || "").trim();
}
