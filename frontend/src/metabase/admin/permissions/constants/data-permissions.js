import { t } from "ttag";

export const DATA_PERMISSION_OPTIONS = {
  all: {
    label: t`Allowed`,
    value: "all",
    icon: "check",
    iconColor: "success",
  },
  controlled: {
    label: t`Limited`,
    value: "controlled",
    icon: "permissions_limited",
    iconColor: "warning",
  },
  none: {
    label: t`No access`,
    value: "none",
    icon: "close",
    iconColor: "danger",
  },
  write: {
    label: t`Allowed`,
    value: "write",
    icon: "check",
    iconColor: "success",
  },
};
