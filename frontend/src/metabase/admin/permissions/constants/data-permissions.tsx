import { t } from "ttag";

import checkIcon from "metabase/ui/components/icons/Icon/icons/check.svg";
import closeIcon from "metabase/ui/components/icons/Icon/icons/close.svg";
import eyeIcon from "metabase/ui/components/icons/Icon/icons/eye.svg";
import eyeCrossedOutIcon from "metabase/ui/components/icons/Icon/icons/eye_crossed_out.svg";
import permissionsLimitedIcon from "metabase/ui/components/icons/Icon/icons/permissions_limited.svg";

import { DataPermissionValue } from "../types";

export const DATA_PERMISSION_OPTIONS = {
  unrestricted: {
    label: t`Can view`,
    value: DataPermissionValue.UNRESTRICTED,
    icon: "eye",
    iconPath: eyeIcon,
    iconColor: "success",
  },
  controlled: {
    label: t`Granular`,
    value: DataPermissionValue.CONTROLLED,
    icon: "permissions_limited",
    iconPath: permissionsLimitedIcon,
    iconColor: "warning",
  },
  noSelfServiceDeprecated: {
    label: t`No self-service (Deprecated)`,
    value: DataPermissionValue.LEGACY_NO_SELF_SERVICE,
    icon: "eye_crossed_out",
    iconPath: eyeCrossedOutIcon,
    iconColor: "accent5",
  },
  no: {
    label: t`No`,
    value: DataPermissionValue.NO,
    icon: "close",
    iconPath: closeIcon,
    iconColor: "danger",
  },
  queryBuilder: {
    label: t`Query builder only`,
    value: DataPermissionValue.QUERY_BUILDER,
    icon: "permissions_limited",
    iconPath: permissionsLimitedIcon,
    iconColor: "warning",
  },
  queryBuilderAndNative: {
    label: t`Query builder and native`,
    value: DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
    icon: "check",
    iconPath: checkIcon,
    iconColor: "success",
  },
};
