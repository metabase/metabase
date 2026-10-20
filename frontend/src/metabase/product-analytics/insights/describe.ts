import { c, msgid, ngettext, t } from "ttag";

import { formatNumber } from "metabase/utils/formatting";

import { IDENTIFIED_COLUMN } from "../columns";
import { NOT_SET_VALUE } from "../sql/analyses/funnel-insights";

import type { Insight, InsightAttribute } from "./types";

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

type DescribedAttribute = Pick<
  InsightAttribute,
  "column" | "displayName" | "description"
>;

const isIdentified = (attribute: DescribedAttribute | undefined) =>
  attribute?.column === IDENTIFIED_COLUMN;

/** One value of an attribute, as a chart axis shows it. */
export const describeValue = (
  attribute: DescribedAttribute | undefined,
  value: string,
): string => {
  if (isIdentified(attribute)) {
    return value === "true" ? t`Identified` : t`Anonymous`;
  }
  return value;
};

/**
 * One condition of an insight, like "Browser is Safari". Whether the person
 * was identified reads as a state rather than a column and value.
 */
export const describeCondition = (
  attribute: DescribedAttribute | undefined,
  value: string,
): string => {
  if (isIdentified(attribute)) {
    return value === "true" ? t`Person is identified` : t`Person is anonymous`;
  }
  const name = attribute?.displayName ?? t`Unknown column`;
  return value === NOT_SET_VALUE
    ? c("{0} is a column name").t`${name} is not set`
    : c("{0} is a column name, {1} is one of its values")
        .t`${name} is ${value}`;
};

/**
 * What an attribute means, for an info tooltip: its column description, or a
 * built-in one for whether the person was identified. `undefined` when there's
 * nothing to add.
 */
export const describeAttribute = (
  attribute: DescribedAttribute | undefined,
): string | undefined =>
  attribute?.description ??
  (isIdentified(attribute)
    ? t`Identified people have been linked to an account as of this step, usually by signing up or logging in. Anonymous people haven't been yet.`
    : undefined);
