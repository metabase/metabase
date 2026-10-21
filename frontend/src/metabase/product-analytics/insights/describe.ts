import { c, t } from "ttag";

import { formatNumber } from "metabase/utils/formatting";

import { IDENTIFIED_COLUMN } from "../columns";
import { NOT_SET_VALUE } from "../sql/analyses/insights";

import type { InsightOutcome } from "./outcomes";
import type {
  ColumnInsightAttribute,
  EventInsightAttribute,
  Insight,
} from "./types";

const MULTIPLIER_FROM = 2;
// Below this, a whole-number percentage would hide the difference.
const PRECISE_DIFFERENCE_BELOW = 0.1;

/**
 * How much more or less likely the group is to have the outcome than everyone
 * else, like "53% less likely". The question's rate names the outcome.
 */
export const describeLift = ({
  rate,
  restRate,
}: Pick<Insight, "rate" | "restRate">): string => {
  const ratio = restRate > 0 ? rate / restRate : Infinity;
  if (ratio >= MULTIPLIER_FROM) {
    const multiplier = Number.isFinite(ratio)
      ? formatNumber(ratio, { maximumFractionDigits: 1 })
      : "∞";
    return c("{0} is a multiplier, like 2.5").t`${multiplier}× as likely`;
  }
  const difference = Math.abs(ratio - 1);
  const percent = formatNumber(difference, {
    number_style: "percent",
    maximumFractionDigits: difference < PRECISE_DIFFERENCE_BELOW ? 1 : 0,
  });
  return ratio >= 1
    ? c("{0} is a percentage").t`${percent} more likely`
    : c("{0} is a percentage").t`${percent} less likely`;
};

/** The outcomes the group gained or lost against everyone else's rate. */
export const describeExcess = (
  { excess }: Pick<Insight, "excess">,
  outcome: InsightOutcome,
): string => {
  const count = Math.round(Math.abs(excess));
  return outcome.describeExcess(count, formatNumber(count), excess >= 0);
};

type DescribedAttribute =
  | Pick<
      ColumnInsightAttribute,
      "kind" | "column" | "displayName" | "description"
    >
  | Pick<
      EventInsightAttribute,
      "kind" | "displayName" | "description" | "minCount"
    >;

const isIdentified = (attribute: DescribedAttribute | undefined) =>
  attribute?.kind === "column" && attribute.column === IDENTIFIED_COLUMN;

/** Whether an actor did an event at least so many times, as a chart axis shows it: "Yes", or "3+ times". */
const describeEventValue = (minCount: number, value: string): string => {
  const did = value === "true";
  if (minCount <= 1) {
    return did ? t`Yes` : t`No`;
  }
  return did
    ? c("{0} is a number").t`${minCount}+ times`
    : c("{0} is a number").t`Under ${minCount} times`;
};

/** One value of an attribute, as a chart axis shows it. */
export const describeValue = (
  attribute: DescribedAttribute | undefined,
  value: string,
): string => {
  if (attribute?.kind === "event") {
    return describeEventValue(attribute.minCount, value);
  }
  if (isIdentified(attribute)) {
    return value === "true" ? t`Identified` : t`Anonymous`;
  }
  return value;
};

/** "Sent an invite: yes" or "Sent an invite: 3+ times", like a column and its value. */
const describeEventCondition = (
  {
    displayName: name,
    minCount,
  }: Pick<EventInsightAttribute, "displayName" | "minCount">,
  value: string,
): string => {
  const did = value === "true";
  if (minCount <= 1) {
    return did
      ? c("{0} is an event name").t`${name}: yes`
      : c("{0} is an event name").t`${name}: no`;
  }
  return did
    ? c("{0} is an event name, {1} is a number").t`${name}: ${minCount}+ times`
    : c("{0} is an event name, {1} is a number")
        .t`${name}: under ${minCount} times`;
};

/**
 * One condition of an insight, like "Browser is Safari". Whether the person
 * was identified reads as a state rather than a column and value.
 */
export const describeCondition = (
  attribute: DescribedAttribute | undefined,
  value: string,
): string => {
  if (attribute?.kind === "event") {
    return describeEventCondition(attribute, value);
  }
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
 * What an attribute means, for an insight's details: its column description, or a
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
