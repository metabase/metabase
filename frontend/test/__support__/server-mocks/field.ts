import { Scope } from "nock";
import { Field, FieldValues } from "metabase-types/api";

export function setupFieldEndpoints(scope: Scope, field: Field) {
  scope.get(`/api/field/${field.id}`).reply(200, field);
}

export function setupFieldValuesEndpoints(scope: Scope, values: FieldValues) {
  scope.get(`/api/field/${values.field_id}/values`).reply(200, values);
}
