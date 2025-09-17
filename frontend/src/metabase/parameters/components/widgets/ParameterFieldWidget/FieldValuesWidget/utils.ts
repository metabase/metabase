import { t } from "ttag";
import _ from "underscore";

import { isTransientId } from "metabase/dashboard/utils";
import { stripId } from "metabase/lib/formatting";
import type { ComboboxItem } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import {
  canListFieldValues,
  canListParameterValues,
  canSearchFieldValues,
  canSearchParameterValues,
  getSourceType,
} from "metabase-lib/v1/parameters/utils/parameter-source";
import {
  isIdParameter,
  isNumberParameter,
  isStringParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import type {
  CardId,
  DashboardId,
  FieldValue,
  Parameter,
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

export function shouldList({
  parameter,
  fields,
  disableSearch,
}: {
  parameter?: Parameter;
  fields: Field[];
  disableSearch: boolean;
}) {
  if (disableSearch) {
    return false;
  } else {
    return parameter
      ? canListParameterValues(parameter)
      : canListFieldValues(fields);
  }
}

function getNonSearchableTokenFieldPlaceholder(
  firstField: Field,
  parameter?: Parameter,
) {
  if (parameter) {
    if (isIdParameter(parameter)) {
      return t`Enter an ID`;
    } else if (isStringParameter(parameter)) {
      return t`Enter some text`;
    } else if (isNumberParameter(parameter)) {
      return t`Enter a number`;
    }

    // fallback
    return t`Enter some text`;
  } else if (firstField) {
    if (firstField.isID()) {
      return t`Enter an ID`;
    } else if (firstField.isString()) {
      return t`Enter some text`;
    } else if (firstField.isNumeric()) {
      return t`Enter a number`;
    }

    // fallback
    return t`Enter some text`;
  }

  // fallback
  return t`Enter some text`;
}

export function searchField(
  field: Field,
  disablePKRemappingForSearch: boolean,
) {
  return field.searchField(disablePKRemappingForSearch);
}

function getSearchableTokenFieldPlaceholder(
  parameter: Parameter | undefined,
  fields: Field[],
  firstField: Field,
  disablePKRemappingForSearch?: boolean,
) {
  let placeholder;

  const names = new Set(
    fields.map((field: Field) =>
      stripId(
        field?.searchField?.(disablePKRemappingForSearch)?.display_name ?? "",
      ),
    ),
  );

  if (
    names.size !== 1 ||
    (parameter != null && getSourceType(parameter) != null)
  ) {
    placeholder = t`Search`;
  } else {
    const [name] = names;

    placeholder = t`Search by ${name}`;
    if (
      firstField &&
      firstField.isID() &&
      firstField !== firstField.searchField(disablePKRemappingForSearch)
    ) {
      placeholder += t` or enter an ID`;
    }
  }
  return placeholder;
}

export function hasList({
  parameter,
  fields,
  disableSearch,
  options,
}: {
  parameter?: Parameter;
  fields: Field[];
  disableSearch: boolean;
  options: FieldValue[];
}) {
  return (
    shouldList({ parameter, fields, disableSearch }) && !_.isEmpty(options)
  );
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
  fields,
  disableSearch,
  disablePKRemappingForSearch,
  valuesMode,
}: {
  parameter?: Parameter;
  fields: Field[];
  disableSearch: boolean;
  disablePKRemappingForSearch?: boolean;
  valuesMode?: ValuesMode;
}) {
  if (disableSearch) {
    return false;
  } else if (valuesMode === "search") {
    return true;
  } else if (parameter) {
    return canSearchParameterValues(parameter, disablePKRemappingForSearch);
  } else {
    return canSearchFieldValues(fields, disablePKRemappingForSearch);
  }
}

export function getTokenFieldPlaceholder({
  fields,
  parameter,
  disableSearch,
  placeholder,
  disablePKRemappingForSearch,
  options,
  valuesMode,
}: {
  fields: Field[];
  parameter?: Parameter;
  disableSearch: boolean;
  placeholder?: string;
  disablePKRemappingForSearch?: boolean;
  options: FieldValue[];
  valuesMode: ValuesMode;
}) {
  if (placeholder) {
    return placeholder;
  }

  const [firstField] = fields;

  if (
    hasList({
      parameter,
      fields,
      disableSearch,
      options,
    })
  ) {
    return t`Search the list`;
  } else if (
    isSearchable({
      parameter,
      fields,
      disableSearch,
      disablePKRemappingForSearch,
      valuesMode,
    })
  ) {
    return getSearchableTokenFieldPlaceholder(
      parameter,
      fields,
      firstField,
      disablePKRemappingForSearch,
    );
  } else {
    return getNonSearchableTokenFieldPlaceholder(firstField, parameter);
  }
}

export function getValuesMode({
  parameter,
  fields,
  disableSearch,
  disablePKRemappingForSearch,
}: {
  parameter?: Parameter;
  fields: Field[];
  disableSearch: boolean;
  disablePKRemappingForSearch?: boolean;
}): ValuesMode {
  if (
    isSearchable({
      parameter,
      fields,
      disableSearch,
      disablePKRemappingForSearch,
      valuesMode: undefined,
    })
  ) {
    return "search";
  }

  if (shouldList({ parameter, fields, disableSearch })) {
    return "list";
  }

  return "none";
}

export function isNumeric(parameter: Parameter, fields: Field[]) {
  return (
    isNumberParameter(parameter) ||
    (fields.length > 0 && fields.every((field) => field.isNumeric()))
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
