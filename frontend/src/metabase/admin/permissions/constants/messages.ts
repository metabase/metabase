import { t } from "ttag";

// XXX: Don't replace the application name. This is admin settings
export const UNABLE_TO_CHANGE_ADMIN_PERMISSIONS = t`Administrators always have the highest level of access to everything in Metabase.`;
export const NATIVE_PERMISSION_REQUIRES_DATA_ACCESS = t`Native query editor access requires full data access.`;

export const getLimitedPermissionAvailabilityMessage = () =>
  t`Only available in certain Metabase plans.`;
