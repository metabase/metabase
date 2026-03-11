import { t } from "ttag";

export const Messages = {
  get UNABLE_TO_CHANGE_ADMIN_PERMISSIONS() {
    return t`Administrators always have the highest level of access to everything in Metabase.`;
  },
  get UNABLE_TO_CHANGE_DATA_ANALYST_PERMISSIONS() {
    return t`Data Analysts always have full access to edit table metadata.`;
  },
  get UNABLE_TO_CHANGE_DATA_ANALYST_LIBRARY_PERMISSIONS() {
    return t`Data Analysts always have full access to library collections.`;
  },
  get NATIVE_PERMISSION_REQUIRES_DATA_ACCESS() {
    return t`Groups with View data access set to "Blocked" can't create queries.`;
  },
  get UNABLE_TO_CHANGE_LEGACY_PERMISSIONS() {
    return t`Change "No self-service (Deprecated)" View data access to enable custom Create queries permissions.`;
  },
  get EXTERNAL_USERS_NO_ACCESS_COLLECTION() {
    return t`Tenant users can only access tenant collections`;
  },
  get EXTERNAL_USERS_NO_ACCESS_DATABASE() {
    return t`Tenant users cannot manage database permissions`;
  },

  get EXTERNAL_USERS_NO_ACCESS_SETTINGS() {
    return t`Tenant users cannot have settings permissions`;
  },
  get EXTERNAL_USERS_NO_ACCESS_MONITORING() {
    return t`Tenant users cannot have monitoring permissions`;
  },
  get UNABLE_TO_DOWNLOAD_RESULTS() {
    return t`Groups with Block data access can't download results`;
  },
};
