import { t } from "ttag";

export const APPLICATION_PERMISSIONS_OPTIONS = {
  yes: {
    // eslint-disable-next-line ttag/no-module-declaration -- see EMB-259
    label: t`Yes`,
    value: "yes",
    icon: "check",
    iconColor: "success",
  },
  no: {
    // eslint-disable-next-line ttag/no-module-declaration -- see EMB-259
    label: t`No`,
    value: "no",
    icon: "close",
    iconColor: "danger",
  },
};
