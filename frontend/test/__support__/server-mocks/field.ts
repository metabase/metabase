import { Scope } from "nock";
import { Field } from "metabase-types/api";

export function setupFieldEndpoints(scope: Scope, field: Field) {
  scope.get(`/api/field/${field.id}`).reply(200, field);
}
