import _ from "underscore";

import { getDefaultFieldSettings } from "metabase/actions/utils";
import type { ActionFormSettings, Parameter } from "metabase-types/api";

export const syncFieldsWithParameters = (
  settings: ActionFormSettings,
  parameters: Parameter[],
): ActionFormSettings => {
  const parameterIds = parameters.map(parameter => parameter.id);
  const fieldIds = Object.keys(settings.fields || {});
  const addedIds = _.difference(parameterIds, fieldIds);
  const removedIds = _.difference(fieldIds, parameterIds);

  if (!addedIds.length && !removedIds.length) {
    return settings;
  }

  return {
    ...settings,
    fields: {
      ..._.omit(settings.fields, removedIds),
      ...Object.fromEntries(
        addedIds.map(id => [id, getDefaultFieldSettings({ id })]),
      ),
    },
  };
};
