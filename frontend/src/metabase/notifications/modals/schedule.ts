import _ from "underscore";

import type { Channel } from "metabase-types/api";

export const getScheduleFromChannel = (
  channel: Channel,
): Pick<
  Channel,
  "schedule_day" | "schedule_frame" | "schedule_hour" | "schedule_type"
> =>
  _.pick(
    channel,
    "schedule_day",
    "schedule_frame",
    "schedule_hour",
    "schedule_type",
  );
