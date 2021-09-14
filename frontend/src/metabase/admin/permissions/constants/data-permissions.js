import { t } from "ttag";

export const DATA_PERMISSION_OPTIONS = {
  all: {
    label: t`Unrestricted`,
    value: "all",
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
    label: t`No self-service`,
    value: "none",
    icon: "eye",
    iconColor: "accent5",
  },
  none: {
    label: t`No`,
    value: "none",
    icon: "close",
    iconColor: "danger",
  },
  write: {
    label: t`Yes`,
    value: "write",
    icon: "check",
    iconColor: "success",
  },
};
