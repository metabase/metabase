import * as MetabaseAnalytics from "metabase/lib/analytics";
import { DataPermission, TableEntityId } from "./types";

const getEventPrefix = (permission: DataPermission) => {
  const shouldUseBackwardCompatibleEventName = permission === "data";
  if (shouldUseBackwardCompatibleEventName) {
    return "";
  }

  return `${permission}-`;
};

const getEventName = (entityId: Partial<TableEntityId>, isNative: boolean) => {
  if (isNative) {
    return "native";
  }
  if (entityId.tableId != null) {
    return "fields";
  } else if (entityId.schemaName != null) {
    return "tables";
  } else {
    return "schemas";
  }
};

export const trackPermissionChange = (
  entityId: Partial<TableEntityId>,
  permission: DataPermission,
  isNative: boolean,
  value: string,
) => {
  const prefix = getEventPrefix(permission);
  const eventName = getEventName(entityId, isNative);

  MetabaseAnalytics.trackStructEvent(
    "Permissions",
    `${prefix}${eventName}`,
    value,
  );
};
