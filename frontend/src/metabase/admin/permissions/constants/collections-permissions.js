import { t } from "ttag";
import { color } from "metabase/lib/colors";

export const COLLECTION_OPTIONS = {
  write: {
    label: t`Curate`,
    value: "write",
    icon: "check",
    iconColor: color("success"),
  },
  read: {
    label: t`View`,
    value: "read",
    icon: "eye",
    iconColor: color("warning"),
  },
  none: {
    label: t`No access`,
    value: "none",
    icon: "close",
    iconColor: color("danger"),
  },
};
