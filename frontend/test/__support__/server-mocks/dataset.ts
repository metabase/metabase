import { Scope } from "nock";
import { Parameter, ParameterValues } from "metabase-types/api";
import { normalizeParameter } from "metabase-lib/parameters/utils/parameter-values";
import { getNonVirtualFields } from "metabase-lib/parameters/utils/parameter-fields";

export function setupParameterValuesEndpoints(
  scope: Scope,
  parameter: Parameter,
  parameterValues: ParameterValues,
) {
  scope
    .post(
      "/api/dataset/parameter/values",
      JSON.stringify({
        parameter: normalizeParameter(parameter),
        field_ids: getNonVirtualFields(parameter).map(field => field.id),
      }),
    )
    .reply(200, parameterValues);
}
