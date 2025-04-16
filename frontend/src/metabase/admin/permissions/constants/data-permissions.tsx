import { t } from "ttag";

import { DataPermissionValue } from "../types";

export const DATA_PERMISSION_OPTIONS = {
  unrestricted: {
    get label() {
      return t`Can view`;
    },
    value: DataPermissionValue.UNRESTRICTED,
    icon: "eye",
    iconColor: "success",
  },
  controlled: {
    get label() {
      return t`Granular`;
    },
    value: DataPermissionValue.CONTROLLED,
    icon: "permissions_limited",
    iconColor: "warning",
  },
  noSelfServiceDeprecated: {
    get label() {
      return t`No self-service (Deprecated)`;
    },
    value: DataPermissionValue.LEGACY_NO_SELF_SERVICE,
    icon: "eye_crossed_out",
    iconColor: "accent5",
  },
  no: {
    get label() {
      return t`No`;
    },
    value: DataPermissionValue.NO,
    icon: "close",
    iconColor: "danger",
  },
  queryBuilder: {
    get label() {
      return t`Query builder only`;
    },
    value: DataPermissionValue.QUERY_BUILDER,
    icon: "permissions_limited",
    iconColor: "warning",
  },
  queryBuilderAndNative: {
    get label() {
      return t`Query builder and native`;
    },
    value: DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
    icon: "check",
    iconColor: "success",
  },
};
