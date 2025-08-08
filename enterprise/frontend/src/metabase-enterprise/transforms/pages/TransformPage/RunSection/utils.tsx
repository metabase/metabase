import dayjs from "dayjs";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { jt, t } from "ttag";

import type { IconName } from "metabase/ui";
import { Anchor } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { getRunListUrl } from "../../../urls";

type RunStatusInfo = {
  icon: IconName;
  color: string;
  message: ReactNode;
};

export function getRunStatusInfo({
  id,
  last_execution,
}: Transform): RunStatusInfo {
  if (last_execution == null) {
    return {
      message: t`This transform hasn’t been run before.`,
      icon: "calendar",
      color: "text-secondary",
    };
  }

  const { status, end_time } = last_execution;
  const endTimeText =
    end_time != null ? dayjs(end_time).local().fromNow() : null;
  const runListLink = (
    <Anchor key="link" component={Link} to={getRunListUrl({ transformId: id })}>
      {t`See all runs`}
    </Anchor>
  );

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
          ? jt`Last run ${endTimeText} successfully. ${runListLink}`
          : jt`Last run successfully. ${runListLink}`,
        icon: "check_filled",
        color: "success",
      };
    case "failed":
      return {
        message: endTimeText
          ? jt`Last run failed ${endTimeText}. ${runListLink}`
          : jt`Last run failed. ${runListLink}`,
        icon: "warning",
        color: "error",
      };
    case "timeout":
      return {
        message: endTimeText
          ? jt`Last run timed out ${endTimeText}. ${runListLink}`
          : jt`Last run timed out. ${runListLink}`,
        icon: "warning",
        color: "error",
      };
  }
}
