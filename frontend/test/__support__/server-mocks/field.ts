import fetchMock from "fetch-mock";
import { Field, FieldValues } from "metabase-types/api";

export function setupFieldEndpoints(field: Field) {
  fetchMock.get(`path:/api/field/${field.id}`, field);
}

export function setupFieldValuesEndpoints(fieldValues: FieldValues) {
  fetchMock.get(`path:/api/field/${fieldValues.field_id}/values`, fieldValues);
}

export function setupFieldsValuesEndpoints(fieldsValues: FieldValues[]) {
  fieldsValues.forEach(fieldValues => setupFieldValuesEndpoints(fieldValues));
}
