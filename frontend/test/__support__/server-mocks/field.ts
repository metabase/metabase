import fetchMock from "fetch-mock";

import type {
  Field,
  FieldId,
  FieldValue,
  GetFieldValuesResponse,
} from "metabase-types/api";

import { PERMISSION_ERROR } from "./constants";

export function setupFieldEndpoints(field: Field) {
  fetchMock.get(`path:/api/field/${field.id}`, field);
  fetchMock.post(`path:/api/field/${field.id}/rescan_values`, {});
  fetchMock.post(`path:/api/field/${field.id}/discard_values`, {});
}

export function setupFieldValuesEndpoints(fieldValues: GetFieldValuesResponse) {
  fetchMock.get(`path:/api/field/${fieldValues.field_id}/values`, fieldValues);
}

export function setupFieldValuesGeneralEndpoint() {
  fetchMock.get(
    { url: /\/api\/field\/\d+\/values/, overwriteRoutes: false },
    [],
  );
}

export function setupUnauthorizedFieldValuesEndpoints(
  fieldValues: GetFieldValuesResponse,
) {
  fetchMock.get(`path:/api/field/${fieldValues.field_id}/values`, {
    status: 403,
    body: PERMISSION_ERROR,
  });
}

export function setupFieldsValuesEndpoints(
  fieldsValues: GetFieldValuesResponse[],
) {
  fieldsValues.forEach(fieldValues => setupFieldValuesEndpoints(fieldValues));
}

export function setupFieldSearchValuesEndpoint(
  fieldId: FieldId,
  searchFieldId: FieldId,
  searchValue: string,
  result: FieldValue[] = [],
) {
  fetchMock.get(
    {
      url: `path:/api/field/${fieldId}/search/${searchFieldId}`,
      query: {
        value: searchValue,
        limit: 100, // corresponds to MAX_SEARCH_RESULTS in FieldValuesWidget
      },
    },
    {
      body: result,
    },
    { overwriteRoutes: false },
  );
}
