import { t } from "ttag";

export const COLLECTION_OPTIONS = {
  write: {
    get label() {
      return t`Curate`;
    },
    value: "write",
    icon: "check",
    iconColor: "success",
  },
  read: {
    get label() {
      return t`View`;
    },
    value: "read",
    icon: "eye",
    iconColor: "warning",
  },
  none: {
    get label() {
      return t`No access`;
    },
    value: "none",
    icon: "close",
    iconColor: "danger",
  },
};
