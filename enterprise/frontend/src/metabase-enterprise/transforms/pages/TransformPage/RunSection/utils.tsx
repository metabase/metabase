import dayjs from "dayjs";
import type { ReactNode } from "react";
import { jt, t } from "ttag";

import type { IconName } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { RelativeDateTime } from "../../../components/RelativeDateTime";

type RunStatusInfo = {
  icon: IconName;
  color: string;
  message: ReactNode;
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
    end_time != null ? (
      <RelativeDateTime date={dayjs(end_time).local().toDate()} />
    ) : null;

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
          ? jt`Last run ${endTimeNode} successfully`
          : t`Last run successfully`,
        icon: "check_filled",
        color: "success",
      };
    case "failed":
      return {
        message: endTimeNode
          ? jt`Last run failed ${endTimeNode}`
          : t`Last run failed`,
        icon: "warning",
        color: "error",
      };
    case "timeout":
      return {
        message: endTimeNode
          ? jt`Last run timed out ${endTimeNode}`
          : t`Last run timed out`,
        icon: "warning",
        color: "error",
      };
  }
}
