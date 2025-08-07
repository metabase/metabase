import { t } from "ttag";

import type { IconName } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { formatTimestamp } from "../../../utils";

type StatusInfo = {
  icon: IconName;
  color: string;
  message: string;
};

export function getStatusInfo({ last_execution }: Transform): StatusInfo {
  if (last_execution == null) {
    return {
      message: t`This transform hasn’t been run before.`,
      icon: "calendar",
      color: "text-secondary",
    };
  }

  const { status, end_time } = last_execution;
  const endTimeText = end_time != null ? formatTimestamp(end_time) : null;

  switch (status) {
    case "started":
      return {
        message: t`Run in progress…`,
        icon: "sync",
        color: "text-primary",
      };
    case "succeeded":
      return {
        message: endTimeText
          ? t`Last run at ${endTimeText} successfully`
          : t`Last run successfully`,
        icon: "check_filled",
        color: "success",
      };
    case "failed":
      return {
        message: endTimeText
          ? t`Last run failed at ${endTimeText}`
          : t`Last run failed`,
        icon: "warning",
        color: "error",
      };
    case "timeout":
      return {
        message: endTimeText
          ? t`Last run timed out at ${endTimeText}`
          : t`Last run timed out`,
        icon: "warning",
        color: "error",
      };
  }
}
