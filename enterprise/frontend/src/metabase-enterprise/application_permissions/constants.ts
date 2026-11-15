import { t } from "ttag";

export const APPLICATION_PERMISSIONS_OPTIONS = {
  yes: {
    get label() {
      return t`Yes`;
    },
    value: "yes",
    icon: "check",
    iconColor: "feedback-positive",
  },
  no: {
    get label() {
      return t`No`;
    },
    value: "no",
    icon: "close",
    iconColor: "feedback-negative",
  },
};
