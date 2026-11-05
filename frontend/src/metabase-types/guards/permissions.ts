import { DataPermissionValue } from "metabase-types/api";

export function isDataPermissionValue(
  value: unknown,
): value is DataPermissionValue {
  return Object.values(DataPermissionValue).some(
    (permissionValue) => permissionValue === value,
  );
}
