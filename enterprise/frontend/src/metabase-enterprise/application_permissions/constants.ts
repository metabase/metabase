import { t } from "ttag";

import type { PermissionOption } from "metabase/plugins";
import { DataPermissionValue } from "metabase-types/api";

export const APPLICATION_PERMISSIONS_OPTIONS = {
  yes: {
    get label() {
      return t`Yes`;
    },
    value: DataPermissionValue.YES,
    icon: "check",
    iconColor: "feedback-positive",
  },
  no: {
    get label() {
      return t`No`;
    },
    value: DataPermissionValue.NO,
    icon: "close",
    iconColor: "feedback-negative",
  },
} satisfies Record<string, PermissionOption>;
