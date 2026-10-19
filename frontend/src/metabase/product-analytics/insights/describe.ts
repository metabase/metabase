import { c, msgid, ngettext } from "ttag";

import { formatNumber } from "metabase/utils/formatting";

import type { Insight } from "./types";

const MULTIPLIER_FROM = 2;
// Below this, a whole-number percentage would hide the difference.
const PRECISE_DIFFERENCE_BELOW = 0.1;

/** How much more or less likely the group is to convert than everyone else. */
export const describeLift = ({
  rate,
  restRate,
}: Pick<Insight, "rate" | "restRate">): string => {
  const ratio = restRate > 0 ? rate / restRate : Infinity;
  if (ratio >= MULTIPLIER_FROM) {
    const multiplier = Number.isFinite(ratio)
      ? formatNumber(ratio, { maximumFractionDigits: 1 })
      : "∞";
    return c("{0} is a multiplier, like 2.5")
      .t`${multiplier}× as likely to convert`;
  }
  const difference = Math.abs(ratio - 1);
  const percent = formatNumber(difference, {
    number_style: "percent",
    maximumFractionDigits: difference < PRECISE_DIFFERENCE_BELOW ? 1 : 0,
  });
  return ratio >= 1
    ? c("{0} is a percentage").t`${percent} more likely to convert`
    : c("{0} is a percentage").t`${percent} less likely to convert`;
};

/** The conversions the group gained or lost against everyone else's rate. */
export const describeExcess = ({ excess }: Pick<Insight, "excess">): string => {
  const count = Math.round(Math.abs(excess));
  const formatted = formatNumber(count);
  return excess >= 0
    ? ngettext(
        msgid`About ${formatted} more conversion than at everyone else's rate`,
        `About ${formatted} more conversions than at everyone else's rate`,
        count,
      )
    : ngettext(
        msgid`About ${formatted} fewer conversion than at everyone else's rate`,
        `About ${formatted} fewer conversions than at everyone else's rate`,
        count,
      );
};
