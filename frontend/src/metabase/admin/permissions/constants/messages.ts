import { t } from "ttag";

export const UNABLE_TO_CHANGE_ADMIN_PERMISSIONS = t`Administrators always have the highest level of access to everything in Metabase.`;
export const NATIVE_PERMISSION_REQUIRES_DATA_ACCESS = t`Groups with View data access set to "Blocked" can't create queries.`;
export const UNABLE_TO_CHANGE_LEGACY_PERMISSIONS = t`Change "No self-service (Deprecated)" View data access to enable custom Create queries permissions.`;

export const getLimitedPermissionAvailabilityMessage = () =>
  t`Only available in certain Metabase plans.`;
