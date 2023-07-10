import { t } from "ttag";
import _ from "underscore";

import { MetabaseApi } from "metabase/services";
import { stripId } from "metabase/lib/formatting";

import {
  isIdParameter,
  isNumberParameter,
  isStringParameter,
} from "metabase-lib/parameters/utils/parameter-type";
import {
  canListFieldValues,
  canListParameterValues,
  canSearchFieldValues,
  canSearchParameterValues,
  getSourceType,
} from "metabase-lib/parameters/utils/parameter-source";

export async function searchFieldValues(
  { fields, value, disablePKRemappingForSearch, maxResults },
  cancelled,
) {
  let options = dedupeValues(
    await Promise.all(
      fields.map(field =>
        MetabaseApi.field_search(
          {
            value,
            fieldId: field.id,
            searchFieldId: field.searchField(disablePKRemappingForSearch).id,
            limit: maxResults,
          },
          { cancelled },
        ),
      ),
    ),
  );

  options = options.map(result => [].concat(result));
  return options;
}

export function getNonVirtualFields(fields) {
  return fields.filter(field => !field.isVirtual());
}

export function dedupeValues(valuesList) {
  const uniqueValueMap = new Map(valuesList.flat().map(o => [o[0], o]));
  return Array.from(uniqueValueMap.values());
}

export function canUseParameterEndpoints(parameter) {
  return parameter != null;
}

export function canUseCardEndpoints(question) {
  return question?.isSaved();
}

export function canUseDashboardEndpoints(dashboard) {
  return dashboard?.id;
}

export function showRemapping(fields) {
  return fields.length === 1;
}

export function shouldList({ parameter, fields, disableSearch }) {
  if (disableSearch) {
    return false;
  } else {
    return parameter
      ? canListParameterValues(parameter)
      : canListFieldValues(fields);
  }
}

function getNonSearchableTokenFieldPlaceholder(firstField, parameter) {
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

export function searchField(field, disablePKRemappingForSearch) {
  return field.searchField(disablePKRemappingForSearch);
}

function getSearchableTokenFieldPlaceholder(
  parameter,
  fields,
  firstField,
  disablePKRemappingForSearch,
) {
  let placeholder;

  const names = new Set(
    fields.map(field =>
      stripId(field.searchField(disablePKRemappingForSearch).display_name),
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

export function hasList({ parameter, fields, disableSearch, options }) {
  return (
    shouldList({ parameter, fields, disableSearch }) && !_.isEmpty(options)
  );
}

// if this search is just an extension of the previous search, and the previous search
// wasn't truncated, then we don't need to do another search because TypeaheadListing
// will filter the previous result client-side
export function isExtensionOfPreviousSearch(
  value,
  lastValue,
  options,
  maxResults,
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
}) {
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

export function isNumeric(field, parameter) {
  if (parameter) {
    return isNumberParameter(parameter);
  }

  return field.isNumeric();
}
