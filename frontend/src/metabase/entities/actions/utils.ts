import _ from "underscore";

import type { ActionFormSettings } from "metabase-types/api";
import type { Parameter as ParameterObject } from "metabase-types/types/Parameter";

export const removeOrphanSettings = (
  settings: ActionFormSettings,
  parameters: ParameterObject[],
): ActionFormSettings => {
  const parameterIds = parameters.map(p => p.id);
  const fieldIds = Object.keys(settings.fields);
  const orphanIds = _.difference(fieldIds, parameterIds);

  return {
    ...settings,
    fields: _.omit(settings.fields, orphanIds),
  };
};
