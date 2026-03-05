/* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
import { t } from "ttag";

import { DataPermissionValue, type PermissionOption } from "../types";

export const DATA_PERMISSION_OPTIONS: Record<string, PermissionOption> = {
  unrestricted: {
    label: t`Can view`,
    value: DataPermissionValue.UNRESTRICTED,
    icon: "eye",
    iconColor: "success",
  },
  controlled: {
    label: t`Granular`,
    value: DataPermissionValue.CONTROLLED,
    icon: "permissions_limited",
    iconColor: "warning",
  },
  noSelfServiceDeprecated: {
    label: t`No self-service (Deprecated)`,
    value: DataPermissionValue.LEGACY_NO_SELF_SERVICE,
    icon: "eye_crossed_out",
    iconColor: "accent5",
  },
  no: {
    label: t`No`,
    value: DataPermissionValue.NO,
    icon: "close",
    iconColor: "danger",
  },
  queryBuilder: {
    label: t`Query builder only`,
    value: DataPermissionValue.QUERY_BUILDER,
    icon: "permissions_limited",
    iconColor: "warning",
  },
  queryBuilderAndNative: {
    label: t`Query builder and native`,
    value: DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
    icon: "check",
    iconColor: "success",
  },
};
