import { Scope } from "nock";
import { Field, FieldValues } from "metabase-types/api";

export function setupFieldEndpoints(scope: Scope, field: Field) {
  scope.get(`/api/field/${field.id}`).reply(200, field);
}

export function setupFieldValuesEndpoints(
  scope: Scope,
  fieldValues: FieldValues,
) {
  scope
    .get(`/api/field/${fieldValues.field_id}/values`)
    .reply(200, fieldValues);
}

export function setupFieldsValuesEndpoints(
  scope: Scope,
  fieldsValues: FieldValues[],
) {
  fieldsValues.forEach(fieldValues => {
    setupFieldValuesEndpoints(scope, fieldValues);
  });
}
