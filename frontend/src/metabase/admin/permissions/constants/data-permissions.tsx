import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const DATA_PERMISSION_OPTIONS = {
  all: {
    label: t`Unrestricted`,
    value: "unrestricted",
    icon: "check",
    iconColor: "success",
  },
  controlled: {
    label: t`Granular`,
    value: "controlled",
    icon: "permissions_limited",
    iconColor: "warning",
  },
  noSelfService: {
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
    value: "legacy-no-self-service",
    icon: "eye",
    iconColor: "accent5",
  },
  no: {
    label: t`No`,
    value: "no",
    icon: "close",
    iconColor: "danger",
  },
  write: {
    label: t`Yes`,
    value: "write",
    icon: "check",
    iconColor: "success",
  },
  queryBuilder: {
    label: t`Query builder only`,
    value: "query-builder",
    icon: "permissions_limited",
    iconColor: "warning",
  },
  queryBuilderAndNative: {
    label: t`Query builder and native`,
    value: "query-builder-and-native",
    icon: "check",
    iconColor: "success",
  },
};
