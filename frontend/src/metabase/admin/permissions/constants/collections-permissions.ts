/* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
import { t } from "ttag";

import { DataPermissionValue } from "../types";

export const COLLECTION_OPTIONS = {
  write: {
    label: t`Curate`,
    value: DataPermissionValue.WRITE,
    icon: "check",
    iconColor: "success",
  },
  read: {
    label: t`View`,
    value: DataPermissionValue.READ,
    icon: "eye",
    iconColor: "warning",
  },
  none: {
    label: t`No access`,
    value: DataPermissionValue.NONE,
    icon: "close",
    iconColor: "danger",
  },
};
