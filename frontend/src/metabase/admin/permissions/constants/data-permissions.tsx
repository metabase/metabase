import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

import { DataPermissionValue } from "../types";

export const DATA_PERMISSION_OPTIONS = {
  unrestricted: {
    label: t`Can view`,
    value: DataPermissionValue.UNRESTRICTED,
    icon: "check",
    iconColor: "success",
  },
  controlled: {
    label: t`Granular`,
    value: DataPermissionValue.CONTROLLED,
    icon: "permissions_limited",
    iconColor: "warning",
  },
  noSelfServiceDeprecated: {
    label: (
      <>
        {t`No self-service (Deprecated)`}
        <Icon
          name="warning"
          color={color("accent5")}
          style={{ marginBottom: "-3px", marginLeft: ".25rem" }}
        />
      </>
    ),
    value: DataPermissionValue.LEGACY_NO_SELF_SERVICE,
    icon: "eye",
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
