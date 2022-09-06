import { TYPE } from "metabase/lib/types";
import { formatSourceForTarget } from "metabase/lib/click-behavior";

import type Database from "metabase-lib/lib/metadata/Database";
import type Field from "metabase-lib/lib/metadata/Field";

import type {
  WritebackAction,
  ParameterMappings,
  ParametersMappedToValues,
  ParametersSourceTargetMap,
  ActionClickBehaviorData,
  ActionClickExtraData,
  ActionClickBehavior,
  ActionParameterTuple,
} from "metabase-types/api/writeback";
import type { Database as IDatabase } from "metabase-types/api/database";
import type { DashCard } from "metabase-types/types/Dashboard";
import type { Parameter, ParameterId } from "metabase-types/types/Parameter";

const DB_WRITEBACK_FEATURE = "actions";
const DB_WRITEBACK_SETTING = "database-enable-actions";

export const isDatabaseWritebackEnabled = (database?: IDatabase | null) =>
  !!database?.settings?.[DB_WRITEBACK_SETTING];

export const isWritebackSupported = (database?: Database | null) =>
  !!database?.hasFeature(DB_WRITEBACK_FEATURE);

const AUTOMATIC_DATE_TIME_FIELDS = [
  TYPE.CreationDate,
  TYPE.CreationTemporal,
  TYPE.CreationTime,
  TYPE.CreationTimestamp,

  TYPE.DeletionDate,
  TYPE.DeletionTemporal,
  TYPE.DeletionTime,
  TYPE.DeletionTimestamp,

  TYPE.UpdatedDate,
  TYPE.UpdatedTemporal,
  TYPE.UpdatedTime,
  TYPE.UpdatedTimestamp,
];

const isAutomaticDateTimeField = (field: Field) => {
  return AUTOMATIC_DATE_TIME_FIELDS.includes(field.semantic_type);
};

export const isEditableField = (field: Field) => {
  const isRealField = typeof field.id === "number";
  if (!isRealField) {
    // Filters out custom, aggregated columns, etc.
    return false;
  }

  if (field.isPK()) {
    // Most of the time PKs are auto-generated,
    // but there are rare cases when they're not
    // In this case they're marked as `database_required`
    return field.database_required;
  }

  if (isAutomaticDateTimeField(field)) {
    return field.database_required;
  }

  return true;
};

export const isActionButtonDashCard = (dashCard: DashCard) =>
  dashCard.visualization_settings?.virtual_card?.display === "action-button";

export const getActionButtonEmitterId = (dashCard: DashCard) =>
  dashCard.visualization_settings?.click_behavior?.emitter_id;

export const getActionButtonActionId = (dashCard: DashCard) =>
  dashCard.visualization_settings?.click_behavior?.action;

export function getActionParameterType(parameter: Parameter) {
  const { type } = parameter;
  if (type === "category") {
    return "string/=";
  }
  return type;
}

function isParametersTuple(
  listOrListOfTuples: ActionParameterTuple[] | Parameter[],
): listOrListOfTuples is ActionParameterTuple[] {
  const [sample] = listOrListOfTuples;
  if (!sample) {
    return false;
  }
  return Array.isArray(sample);
}

function getParametersFromTuples(
  parameterTuples: ActionParameterTuple[] | Parameter[],
): Parameter[] {
  if (!isParametersTuple(parameterTuples)) {
    return parameterTuples;
  }
  return parameterTuples.map(tuple => {
    const [, parameter] = tuple;
    return parameter;
  });
}

export const getActionEmitterParameterMappings = (action: WritebackAction) => {
  const parameters = getParametersFromTuples(action.parameters);
  const parameterMappings: ParameterMappings = {};

  parameters.forEach(parameter => {
    parameterMappings[parameter.id] = [
      "variable",
      ["template-tag", parameter.slug],
    ];
  });

  return parameterMappings;
};

export function getActionParameters(
  parameterMapping: ParametersSourceTargetMap = {},
  {
    data,
    extraData,
    clickBehavior,
  }: {
    data: ActionClickBehaviorData;
    extraData: ActionClickExtraData;
    clickBehavior: ActionClickBehavior;
  },
) {
  const action = extraData.actions[clickBehavior.action];

  const parameters = getParametersFromTuples(action.parameters);
  const parameterValuesMap: ParametersMappedToValues = {};

  Object.values(parameterMapping).forEach(({ id, source, target }) => {
    const targetParameter = parameters.find(parameter => parameter.id === id);
    if (targetParameter) {
      const result = formatSourceForTarget(source, target, {
        data,
        extraData,
        clickBehavior,
      });
      // For some reason it's sometimes [1] and sometimes just 1
      const value = Array.isArray(result) ? result[0] : result;

      parameterValuesMap[id] = {
        value,
        type: getActionParameterType(targetParameter),
      };
    }
  });

  return parameterValuesMap;
}

export function getNotProvidedActionParameters(
  action: WritebackAction,
  parameterValuesMap: ParametersMappedToValues,
) {
  const parameters = getParametersFromTuples(action.parameters);
  const mappedParameterIDs = Object.keys(parameterValuesMap);

  const emptyParameterIDs: ParameterId[] = [];
  mappedParameterIDs.forEach(parameterId => {
    const { value } = parameterValuesMap[parameterId];
    if (value === undefined) {
      emptyParameterIDs.push(parameterId);
    }
  });

  return parameters.filter(parameter => {
    if ("default" in parameter) {
      return false;
    }
    const isNotMapped = !mappedParameterIDs.includes(parameter.id);
    const isMappedButNoValue = emptyParameterIDs.includes(parameter.id);
    return isNotMapped || isMappedButNoValue;
  });
}
