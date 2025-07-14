import { t } from "ttag";

export const Messages = {
  get UNABLE_TO_CHANGE_ADMIN_PERMISSIONS() {
    return t`Administrators always have the highest level of access to everything in Metabase.`;
  },
  get NATIVE_PERMISSION_REQUIRES_DATA_ACCESS() {
    return t`Groups with View data access set to "Blocked" can't create queries.`;
  },
  get UNABLE_TO_CHANGE_LEGACY_PERMISSIONS() {
    return t`Change "No self-service (Deprecated)" View data access to enable custom Create queries permissions.`;
  },
  get EXTERNAL_USERS_NO_ACCESS_COLLECTION() {
    return t`External Users can only access tenant collections`;
  },
  get EXTERNAL_USERS_NO_ACCESS_DATABASE() {
    return t`External Users cannot manage database permissions`;
  },

  get EXTERNAL_USERS_NO_ACCESS_SETTINGS() {
    return t`External Users cannot have settings permissions`;
  },
  get EXTERNAL_USERS_NO_ACCESS_MONITORING() {
    return t`External Users cannot have monitioring permissions`;
  },
};

export const getLimitedPermissionAvailabilityMessage = () =>
  t`Only available in certain Metabase plans.`;
