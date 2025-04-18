import { t } from "ttag";

// eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
export const UNABLE_TO_CHANGE_ADMIN_PERMISSIONS = t`Administrators always have the highest level of access to everything in Metabase.`;
// eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
export const NATIVE_PERMISSION_REQUIRES_DATA_ACCESS = t`Groups with View data access set to "Blocked" can't create queries.`;
// eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
export const UNABLE_TO_CHANGE_LEGACY_PERMISSIONS = t`Change "No self-service (Deprecated)" View data access to enable custom Create queries permissions.`;

export const getLimitedPermissionAvailabilityMessage = () =>
  t`Only available in certain Metabase plans.`;
