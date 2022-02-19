import { t } from "ttag";

export const DOWNLOAD_PERMISSION_OPTIONS = {
  none: {
    label: t`No`,
    value: "none",
    icon: "close",
    iconColor: "danger",
  },
  limited: {
    label: t`10 thousand rows`,
    value: "limited",
    icon: "check",
    iconColor: "admin7",
  },
  full: {
    label: t`1 million rows`,
    value: "full",
    icon: "check",
    iconColor: "admin7",
  },
};
