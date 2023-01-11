import type { Scope } from "nock";
import type Field from "metabase-lib/metadata/Field";

export function setupFieldEndpoints(scope: Scope, field: Field) {
  scope.get(`/api/field/${field.id}`).reply(200, field.getPlainObject());
}
