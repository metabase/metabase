import type {
  ActionClickBehavior,
  ActionMenuClickBehavior,
  ArbitraryCustomDestinationClickBehavior,
  BaseActionClickBehavior,
  ClickBehavior,
  ClickBehaviorParameterMapping,
  CrossFilterClickBehavior,
  CustomDestinationClickBehavior,
  CustomDestinationClickBehaviorEntity,
  DeleteActionClickBehavior,
  EntityCustomDestinationClickBehavior,
  ImplicitActionClickBehavior,
  InsertActionClickBehavior,
  UpdateActionClickBehavior,
} from "metabase-types/api";
import { isObject } from "metabase/lib/types";

const isCustomDestinationClickBehaviorEntity = (
  value: unknown,
): value is CustomDestinationClickBehaviorEntity => {
  return value === "dashboard" || value === "question";
};

export const isEntityCustomDestinationClickBehavior = (
  value: unknown,
): value is EntityCustomDestinationClickBehavior => {
  return (
    isObject(value) &&
    "type" in value &&
    value.type === "link" &&
    "linkType" in value &&
    isCustomDestinationClickBehaviorEntity(value.linkType) &&
    "targetId" in value &&
    ["number", "string"].includes(typeof value.targetId) &&
    (!("parameterMapping" in value) ||
      typeof value.parameterMapping === "undefined" ||
      isClickBehaviorParameterMapping(value.parameterMapping))
  );
};

export const isArbitraryCustomDestinationClickBehavior = (
  value: unknown,
): value is ArbitraryCustomDestinationClickBehavior => {
  return (
    isObject(value) &&
    "type" in value &&
    value.type === "link" &&
    "linkType" in value &&
    value.linkType === "url" &&
    "linkTemplate" in value &&
    typeof value.linkTemplate === "string" &&
    (!("linkTextTemplate" in value) ||
      ["undefined", "string"].includes(typeof value.linkTextTemplate))
  );
};

export const isClickBehaviorParameterMapping = (
  value: unknown,
): value is ClickBehaviorParameterMapping => {
  return (
    isObject(value) &&
    Object.values(value).every(mapping => {
      return (
        isObject(mapping) &&
        "id" in mapping &&
        typeof mapping.id === "string" &&
        "source" in mapping &&
        isObject(mapping.source) &&
        "id" in mapping.source &&
        typeof mapping.source.id === "string" &&
        "name" in mapping.source &&
        typeof mapping.source.name === "string" &&
        "type" in mapping.source &&
        (mapping.source.type === "column" ||
          mapping.source.type === "parameter") &&
        "target" in mapping &&
        isObject(mapping.target) &&
        "id" in mapping.source &&
        typeof mapping.source.id === "string" &&
        "type" in mapping.target &&
        (mapping.target.type === "dimension" ||
          mapping.target.type === "parameter")
      );
    })
  );
};

const isBaseActionClickBehavior = (
  value: unknown,
): value is BaseActionClickBehavior => {
  return (
    isObject(value) &&
    "type" in value &&
    value.type === "action" &&
    "actionType" in value &&
    typeof value.actionType === "string"
  );
};

const isInsertActionClickBehavior = (
  value: unknown,
): value is InsertActionClickBehavior => {
  return (
    isBaseActionClickBehavior(value) &&
    value.actionType === "insert" &&
    "tableId" in value &&
    value.tableId === "number"
  );
};

const isUpdateActionClickBehavior = (
  value: unknown,
): value is UpdateActionClickBehavior => {
  return (
    isBaseActionClickBehavior(value) &&
    value.actionType === "update" &&
    "objectDetailDashCardId" in value &&
    value.objectDetailDashCardId === "number"
  );
};

const isDeleteActionClickBehavior = (
  value: unknown,
): value is DeleteActionClickBehavior => {
  return (
    isBaseActionClickBehavior(value) &&
    value.actionType === "delete" &&
    "objectDetailDashCardId" in value &&
    value.objectDetailDashCardId === "number"
  );
};

export const isImplicitActionClickBehavior = (
  value: unknown,
): value is ImplicitActionClickBehavior => {
  return (
    isInsertActionClickBehavior(value) ||
    isUpdateActionClickBehavior(value) ||
    isDeleteActionClickBehavior(value)
  );
};

export const isActionMenuClickBehavior = (
  value: unknown,
): value is ActionMenuClickBehavior => {
  return isObject(value) && "type" in value && value.type === "actionMenu";
};

export const isCrossFilterClickBehavior = (
  value: unknown,
): value is CrossFilterClickBehavior => {
  return (
    isObject(value) &&
    "type" in value &&
    value.type === "crossfilter" &&
    (!("parameterMapping" in value) ||
      typeof value.parameterMapping === "undefined" ||
      isClickBehaviorParameterMapping(value.parameterMapping))
  );
};

export const isCustomDestinationClickBehavior = (
  value: unknown,
): value is CustomDestinationClickBehavior => {
  return (
    isEntityCustomDestinationClickBehavior(value) ||
    isArbitraryCustomDestinationClickBehavior(value)
  );
};

export const isActionClickBehavior = (
  value: unknown,
): value is ActionClickBehavior => {
  return isImplicitActionClickBehavior(value);
};

export const isClickBehavior = (value: unknown): value is ClickBehavior => {
  return (
    isActionMenuClickBehavior(value) ||
    isCrossFilterClickBehavior(value) ||
    isCustomDestinationClickBehavior(value) ||
    isActionClickBehavior(value)
  );
};
