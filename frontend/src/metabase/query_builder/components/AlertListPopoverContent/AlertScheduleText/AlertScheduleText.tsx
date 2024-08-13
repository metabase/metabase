import type { Channel } from "metabase-types/api";

import { getScheduleText } from "./get-schedule-text";

type AlertScheduleTextProps = {
  schedule: Channel;
  verbose?: boolean;
};

export const AlertScheduleText = ({
  schedule,
  verbose = false,
}: AlertScheduleTextProps) => {
  const scheduleText = getScheduleText({
    schedule,
    verbose,
  });

  if (verbose) {
    return (
      <span>
        Checking <b>{scheduleText}</b>
      </span>
    );
  } else {
    return <span>{scheduleText}</span>;
  }
};
