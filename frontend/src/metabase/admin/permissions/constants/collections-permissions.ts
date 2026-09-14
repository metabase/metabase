import { t } from "ttag";

import { DataPermissionValue, type PermissionOption } from "../types";

export const COLLECTION_OPTIONS: Record<string, PermissionOption> = {
  write: {
    get label() {
      return t`Curate`;
    },
    value: DataPermissionValue.WRITE,
    icon: "check",
    iconColor: "feedback-positive",
  },
  read: {
    get label() {
      return t`View`;
    },
    value: DataPermissionValue.READ,
    icon: "eye",
    iconColor: "feedback-warning",
  },
  none: {
    get label() {
      return t`No access`;
    },
    value: DataPermissionValue.NONE,
    icon: "close",
    iconColor: "feedback-negative",
  },
};
