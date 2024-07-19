import { t } from "ttag";

import type { Tab } from "./types";

export const TABS: Tab[] = [
  { label: t`Between`, operator: "between" },
  { label: t`Before`, operator: "<" },
  { label: t`On`, operator: "=" },
  { label: t`After`, operator: ">" },
];

/**
 * Months have different number of day rows (4, 5 or 6). his causes date picker height to change when
 * navigating between months, and the "next" & "previous" buttons shift their positions (metabase#39487)
 */
export const MIN_DATE_PICKER_HEIGHT = 314;

/**
 * When changing the mode from day picker to year picker (by clicking year in date picker header)
 * the width of the date picker changes and the "next" & "previous" buttons shift their positions (metabase#39487)
 */
export const MIN_DATE_PICKER_WIDTH = 292;

export const MIN_DATE_RANGE_PICKER_HEIGHT = MIN_DATE_PICKER_HEIGHT;

export const MIN_DATE_RANGE_PICKER_WIDTH = 600;

/**
 * These styles make date picker look better with the width / height constants defined above (metabase#39487)
 */
export const DATE_PICKER_STYLES = {
  decadeLevel: {
    width: "100%",
  },
  yearLevel: {
    width: "100%",
  },
  yearsList: {
    width: "100%",
  },
  monthsList: {
    width: "100%",
  },
};
