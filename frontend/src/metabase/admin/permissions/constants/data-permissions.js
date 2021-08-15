import { t } from "ttag";
import { color } from "metabase/lib/colors";

export const DATA_PERMISSION_OPTIONS = {
  all: {
    label: t`Allowed`,
    value: "all",
    icon: "check",
    iconColor: color("success"),
  },
  controlled: {
    label: t`Limited`,
    value: "controlled",
    icon: "permissions_limited",
    iconColor: color("warning"),
  },
  none: {
    label: t`No access`,
    value: "none",
    icon: "close",
    iconColor: color("danger"),
  },
  write: {
    label: t`Allowed`,
    value: "write",
    icon: "check",
    iconColor: color("success"),
  },
};
