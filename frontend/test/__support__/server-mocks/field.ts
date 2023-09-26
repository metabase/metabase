import fetchMock from "fetch-mock";
import type { Field, FieldId, FieldValuesResult } from "metabase-types/api";
import { PERMISSION_ERROR } from "./constants";

export function setupFieldEndpoints(field: Field) {
  fetchMock.get(`path:/api/field/${field.id}`, field);
  fetchMock.post(`path:/api/field/${field.id}/rescan_values`, {});
  fetchMock.post(`path:/api/field/${field.id}/discard_values`, {});
}

export function setupFieldValuesEndpoints(fieldValues: FieldValuesResult) {
  fetchMock.get(`path:/api/field/${fieldValues.field_id}/values`, fieldValues);
}

export function setupUnauthorizedFieldValuesEndpoints(
  fieldValues: FieldValuesResult,
) {
  fetchMock.get(`path:/api/field/${fieldValues.field_id}/values`, {
    status: 403,
    body: PERMISSION_ERROR,
  });
}

export function setupFieldsValuesEndpoints(fieldsValues: FieldValuesResult[]) {
  fieldsValues.forEach(fieldValues => setupFieldValuesEndpoints(fieldValues));
}

export function setupFieldSearchValuesEndpoints<T>(
  fieldId: FieldId,
  searchValue: string,
  result: T[] = [],
) {
  fetchMock.get(
    {
      url: `path:/api/field/${fieldId}/search/${fieldId}`,
      query: {
        value: searchValue,
        limit: 100, // corresponds to MAX_SEARCH_RESULTS in FieldValuesWidget
      },
    },
    {
      body: result,
    },
  );
}
