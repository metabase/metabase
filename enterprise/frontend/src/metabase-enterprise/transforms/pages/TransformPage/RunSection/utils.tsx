import dayjs from "dayjs";
import { t } from "ttag";

import type { IconName } from "metabase/ui";
import type { Transform } from "metabase-types/api";

type RunStatusInfo = {
  icon: IconName;
  color: string;
  message: string;
};

export function getRunStatusInfo({ last_execution }: Transform): RunStatusInfo {
  if (last_execution == null) {
    return {
      message: t`This transform hasn’t been run before.`,
      icon: "calendar",
      color: "text-secondary",
    };
  }

  const { status, end_time } = last_execution;
  const endTimeNode =
    end_time != null ? dayjs(end_time).local().fromNow() : null;

  switch (status) {
    case "started":
      return {
        message: t`Run in progress…`,
        icon: "sync",
        color: "text-primary",
      };
    case "succeeded":
      return {
        message: endTimeNode
          ? t`Last run ${endTimeNode} successfully`
          : t`Last run successfully`,
        icon: "check_filled",
        color: "success",
      };
    case "failed":
      return {
        message: endTimeNode
          ? t`Last run failed ${endTimeNode}`
          : t`Last run failed`,
        icon: "warning",
        color: "error",
      };
    case "timeout":
      return {
        message: endTimeNode
          ? t`Last run timed out ${endTimeNode}`
          : t`Last run timed out`,
        icon: "warning",
        color: "error",
      };
  }
}
