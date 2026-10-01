import { useSetting } from "metabase/settings";
import type { TimeConfig } from "metabase-lib";

const DEFAULT_START_OF_WEEK: TimeConfig["start-of-week"] = "sunday";

export function useTimeConfig(): TimeConfig {
  const startOfWeek = useSetting("start-of-week");

  return {
    "start-of-week": startOfWeek ?? DEFAULT_START_OF_WEEK,
  };
}
