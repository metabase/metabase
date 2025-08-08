import dayjs from "dayjs";
import { useEffect } from "react";
import { useUpdate } from "react-use";

import { Tooltip } from "metabase/ui";

const UPDATE_INTERVAL = 60 * 1000;

type RelativeDateTimeProps = {
  date: Date;
};

export function RelativeDateTime({ date }: RelativeDateTimeProps) {
  const update = useUpdate();

  useEffect(() => {
    const intervalId = setInterval(() => update(), UPDATE_INTERVAL);
    return () => clearInterval(intervalId);
  }, [update]);

  return (
    <Tooltip label={dayjs(date).format("lll")}>
      <span>{dayjs(date).fromNow()}</span>
    </Tooltip>
  );
}
