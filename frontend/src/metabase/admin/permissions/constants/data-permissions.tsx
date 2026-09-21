import { t } from "ttag";

import { DataPermissionValue, type PermissionOption } from "../types";

export const DATA_PERMISSION_OPTIONS: Record<string, PermissionOption> = {
  unrestricted: {
    get label() {
      return t`Can view`;
    },
    value: DataPermissionValue.UNRESTRICTED,
    icon: "eye",
    iconColor: "feedback-positive",
  },
  controlled: {
    get label() {
      return t`Granular`;
    },
    value: DataPermissionValue.CONTROLLED,
    icon: "permissions_limited",
    iconColor: "feedback-warning",
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
    iconColor: "feedback-negative",
  },
  queryBuilder: {
    get label() {
      return t`Query builder only`;
    },
    value: DataPermissionValue.QUERY_BUILDER,
    icon: "permissions_limited",
    iconColor: "feedback-warning",
  },
  queryBuilderAndNative: {
    get label() {
      return t`Query builder and native`;
    },
    value: DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
    icon: "check",
    iconColor: "feedback-positive",
  },
};
