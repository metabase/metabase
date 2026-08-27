/* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
import { t } from "ttag";

import { DataPermissionValue, type PermissionOption } from "../types";

export const COLLECTION_OPTIONS: Record<string, PermissionOption> = {
  write: {
    label: t`Curate`,
    value: DataPermissionValue.WRITE,
    icon: "check",
    iconColor: "feedback-positive",
  },
  read: {
    label: t`View`,
    value: DataPermissionValue.READ,
    icon: "eye",
    iconColor: "feedback-warning",
  },
  none: {
    label: t`No access`,
    value: DataPermissionValue.NONE,
    icon: "close",
    iconColor: "feedback-negative",
  },
};
