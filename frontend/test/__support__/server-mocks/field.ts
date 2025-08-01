import fetchMock, { type MockOptionsMethodGet } from "fetch-mock";

import type {
  Field,
  FieldId,
  FieldValue,
  GetFieldValuesResponse,
} from "metabase-types/api";
import { createMockFieldValues } from "metabase-types/api/mocks";

import { PERMISSION_ERROR } from "./constants";

export function setupFieldEndpoints(field: Field) {
  fetchMock.get(`path:/api/field/${field.id}`, field);
  fetchMock.post(`path:/api/field/${field.id}/rescan_values`, {});
  fetchMock.post(`path:/api/field/${field.id}/discard_values`, {});
}

export function setupFieldValuesEndpoint(fieldValues: GetFieldValuesResponse) {
  fetchMock.get(`path:/api/field/${fieldValues.field_id}/values`, fieldValues);
  fetchMock.post(
    `path:/api/field/${fieldValues.field_id}/values`,
    async (url) => {
      const lastCall = fetchMock.lastCall(url);
      return createMockFieldValues(await lastCall?.request?.json());
    },
  );
}

export function setupRemappedFieldValueEndpoint(
  fieldId: FieldId,
  remappedFieldId: FieldId,
  value: string,
  fieldValue: FieldValue,
) {
  fetchMock.get(
    {
      url: `path:/api/field/${fieldId}/remapping/${remappedFieldId}`,
      query: { value },
    },
    fieldValue,
    { overwriteRoutes: false },
  );
}

export function setupUnauthorizedFieldEndpoint(
  field: Field,
  options?: MockOptionsMethodGet,
) {
  fetchMock.get(
    `path:/api/field/${field.id}`,
    {
      status: 403,
      body: PERMISSION_ERROR,
    },
    options,
  );
}

export function setupUnauthorizedFieldValuesEndpoints(
  fieldId: FieldId,
  options?: MockOptionsMethodGet,
) {
  fetchMock.get(
    `path:/api/field/${fieldId}/values`,
    {
      status: 403,
      body: PERMISSION_ERROR,
    },
    options,
  );
}

export function setupFieldsValuesEndpoints(
  fieldsValues: GetFieldValuesResponse[],
) {
  fieldsValues.forEach((fieldValues) => setupFieldValuesEndpoint(fieldValues));
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
