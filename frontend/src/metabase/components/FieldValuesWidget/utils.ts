import { t } from "ttag";
import _ from "underscore";

import { stripId } from "metabase/lib/formatting";
import { MetabaseApi } from "metabase/services";
import type Question from "metabase-lib/v1/Question";
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
import type { Dashboard, Parameter, FieldValue } from "metabase-types/api";

import type { ValuesMode } from "./types";

export async function searchFieldValues(
  {
    fields,
    value,
    disablePKRemappingForSearch,
    maxResults,
  }: {
    fields: Field[];
    value: string;
    disablePKRemappingForSearch?: boolean;
    maxResults: number;
  },
  cancelled: Promise<unknown>,
) {
  const options: null | FieldValue[] = dedupeValues(
    await Promise.all(
      fields.map((field: Field) =>
        MetabaseApi.field_search(
          {
            value,
            fieldId: field.id,
            searchFieldId: field.searchField(disablePKRemappingForSearch)?.id,
            limit: maxResults,
          },
          { cancelled },
        ),
      ),
    ),
  );

  return options;
}

export function getNonVirtualFields(fields: Field[]) {
  return fields.filter(field => !field.isVirtual());
}

export function dedupeValues(valuesList: FieldValue[][]): FieldValue[] {
  const uniqueValueMap = new Map(valuesList.flat().map(o => [o[0], o]));
  return Array.from(uniqueValueMap.values());
}

export function canUseParameterEndpoints(parameter?: Parameter) {
  return parameter != null;
}

export function canUseCardEndpoints(question?: Question) {
  return question?.isSaved();
}

export function canUseDashboardEndpoints(dashboard?: Dashboard) {
  return dashboard?.id;
}

export function showRemapping(fields: Field[]) {
  return fields.length === 1;
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

export function isNumeric(field: Field, parameter?: Parameter) {
  if (parameter) {
    return isNumberParameter(parameter);
  }

  return field.isNumeric();
}
