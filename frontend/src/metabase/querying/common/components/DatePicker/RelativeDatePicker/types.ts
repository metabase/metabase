import type { RelativeIntervalDirection } from "metabase/querying/common/types";

export interface Tab {
  label: string;
  direction: RelativeIntervalDirection;
}
