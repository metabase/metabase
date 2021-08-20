import { t } from "ttag";

export const COLLECTION_OPTIONS = {
  write: {
    label: t`Curate`,
    value: "write",
    icon: "check",
    iconColor: "success",
  },
  read: {
    label: t`View`,
    value: "read",
    icon: "eye",
    iconColor: "warning",
  },
  none: {
    label: t`No access`,
    value: "none",
    icon: "close",
    iconColor: "danger",
  },
};
