import type { RelativeIntervalDirection } from "metabase/querying/filters/types";

export interface Tab {
  label: string;
  direction: RelativeIntervalDirection;
}
