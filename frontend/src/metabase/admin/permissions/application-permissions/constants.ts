import { t } from "ttag";

export const APPLICATION_PERMISSIONS_OPTIONS = {
  yes: {
    get label() {
      return t`Yes`;
    },
    value: "yes",
    icon: "check",
    iconColor: "success",
  },
  no: {
    get label() {
      return t`No`;
    },
    value: "no",
    icon: "close",
    iconColor: "danger",
  },
};
