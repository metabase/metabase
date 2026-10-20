import { c, msgid, ngettext, t } from "ttag";

import type { Period } from "../spec/types";

/**
 * What an analysis's insights are about, in words: the outcome counted at
 * each question, and what's counted. Strings are formatted by the caller.
 */
export type InsightOutcome = {
  /** Whether a higher rate is the better direction, for colors. */
  isHigherBetter: boolean;
  /** Shown while insights load. */
  searchingLabel: string;
  /** "34% converted" */
  describeRate: (rate: string) => string;
  /** "34% converted vs. 20% of everyone else · 1,200 people" */
  describeComparison: (rate: string, restRate: string, size: string) => string;
  /** "2.5× as likely to convert" */
  describeMultiple: (multiplier: string) => string;
  /** "20% more likely to convert", or less. */
  describeDifference: (percent: string, isMore: boolean) => string;
  /** "About 340 more conversions than at everyone else's rate", or fewer. */
  describeExcess: (count: number, formatted: string, isMore: boolean) => string;
  /** When no insight stands out. */
  describeNothingFound: (attributes: number, size: string) => string;
  /** When there's nothing to compare actors by. */
  noAttributesLabel: string;
  /**
   * The explore query's columns: the size and rate of each segment, and the
   * rate expected of it when the population has expected outcomes.
   */
  explore: {
    countColumn: string;
    countTitle: string;
    rateColumn: string;
    rateTitle: string;
    expectedRateColumn?: string;
    expectedRateTitle?: string;
  };
};

const columnsLabel = () =>
  t`There are no columns with few enough distinct values to compare people by.`;

/** People reaching the next funnel step. */
export const getConversionOutcome = (): InsightOutcome => ({
  isHigherBetter: true,
  searchingLabel: t`Looking for what's different about people who convert…`,
  describeRate: (rate) => c("{0} is a percentage").t`${rate} converted`,
  describeComparison: (rate, restRate, size) =>
    c("{0} and {1} are percentages, {2} is a number of people")
      .t`${rate} converted vs. ${restRate} of everyone else · ${size} people`,
  describeMultiple: (multiplier) =>
    c("{0} is a multiplier, like 2.5").t`${multiplier}× as likely to convert`,
  describeDifference: (percent, isMore) =>
    isMore
      ? c("{0} is a percentage").t`${percent} more likely to convert`
      : c("{0} is a percentage").t`${percent} less likely to convert`,
  describeExcess: (count, formatted, isMore) =>
    isMore
      ? ngettext(
          msgid`About ${formatted} more conversion than at everyone else's rate`,
          `About ${formatted} more conversions than at everyone else's rate`,
          count,
        )
      : ngettext(
          msgid`About ${formatted} fewer conversion than at everyone else's rate`,
          `About ${formatted} fewer conversions than at everyone else's rate`,
          count,
        ),
  describeNothingFound: (columns, size) =>
    c("{0} is a number of columns, {1} is a number of people")
      .t`Nothing stands out. Checked ${columns} columns across ${size} people.`,
  noAttributesLabel: columnsLabel(),
  explore: {
    countColumn: "people",
    countTitle: t`People`,
    rateColumn: "conversion",
    rateTitle: t`Conversion`,
  },
});

/** Visits that land on a page and leave without another step. */
export const getBounceOutcome = (): InsightOutcome => ({
  isHigherBetter: false,
  searchingLabel: t`Looking for what's different about visits that bounce…`,
  describeRate: (rate) => c("{0} is a percentage").t`${rate} bounced`,
  describeComparison: (rate, restRate, size) =>
    c("{0} and {1} are percentages, {2} is a number of visits")
      .t`${rate} bounced vs. ${restRate} of other visits · ${size} visits`,
  describeMultiple: (multiplier) =>
    c("{0} is a multiplier, like 2.5").t`${multiplier}× as likely to bounce`,
  describeDifference: (percent, isMore) =>
    isMore
      ? c("{0} is a percentage").t`${percent} more likely to bounce`
      : c("{0} is a percentage").t`${percent} less likely to bounce`,
  describeExcess: (count, formatted, isMore) =>
    isMore
      ? ngettext(
          msgid`About ${formatted} more bounce than at other visits' rate`,
          `About ${formatted} more bounces than at other visits' rate`,
          count,
        )
      : ngettext(
          msgid`About ${formatted} fewer bounce than at other visits' rate`,
          `About ${formatted} fewer bounces than at other visits' rate`,
          count,
        ),
  describeNothingFound: (columns, size) =>
    c("{0} is a number of columns, {1} is a number of visits")
      .t`Nothing stands out. Checked ${columns} columns across ${size} visits.`,
  noAttributesLabel: columnsLabel(),
  explore: {
    countColumn: "visits",
    countTitle: t`Visits`,
    rateColumn: "bounce_rate",
    rateTitle: t`Bounce rate`,
  },
});

const periodWords = (
  period: Period,
): { next: string; active: string; activeTitle: string } => {
  switch (period) {
    case "day":
      return {
        next: t`the next day`,
        active: t`active days`,
        activeTitle: t`Active days`,
      };
    case "week":
      return {
        next: t`the next week`,
        active: t`active weeks`,
        activeTitle: t`Active weeks`,
      };
    case "month":
      return {
        next: t`the next month`,
        active: t`active months`,
        activeTitle: t`Active months`,
      };
  }
};

/**
 * People active in a period who are active the next one too, compared with
 * what's expected of people as active as them.
 */
export const getReturnOutcome = (period: Period): InsightOutcome => {
  const { next, active, activeTitle } = periodWords(period);
  return {
    isHigherBetter: true,
    searchingLabel: t`Looking for what people who return did…`,
    describeRate: (rate) =>
      c("{0} is a percentage, {1} is a period like 'the next week'")
        .t`${rate} returned ${next}`,
    describeComparison: (rate, expectedRate, size) =>
      c(
        "{0} and {1} are percentages, {2} is a number, {3} is a plural like 'active weeks'",
      )
        .t`${rate} returned vs. ${expectedRate} expected for people as active · ${size} ${active}`,
    describeMultiple: (multiplier) =>
      c("{0} is a multiplier, like 2.5").t`${multiplier}× as likely to return`,
    describeDifference: (percent, isMore) =>
      isMore
        ? c("{0} is a percentage").t`${percent} more likely to return`
        : c("{0} is a percentage").t`${percent} less likely to return`,
    describeExcess: (count, formatted, isMore) =>
      isMore
        ? ngettext(
            msgid`About ${formatted} more return than expected for people as active`,
            `About ${formatted} more returns than expected for people as active`,
            count,
          )
        : ngettext(
            msgid`About ${formatted} fewer return than expected for people as active`,
            `About ${formatted} fewer returns than expected for people as active`,
            count,
          ),
    describeNothingFound: (events, size) =>
      c(
        "{0} is a number of event conditions, {1} is a number, {2} is a plural like 'active weeks'",
      )
        .t`Nothing stands out. Checked ${events} event conditions across ${size} ${active}.`,
    noAttributesLabel: t`There are no event segments on this table to compare people by. Save some to see what people who return do.`,
    explore: {
      countColumn: "active_periods",
      countTitle: activeTitle,
      rateColumn: "came_back",
      rateTitle: t`Returned`,
      expectedRateColumn: "expected_rate",
      expectedRateTitle: t`Expected for people as active`,
    },
  };
};

/**
 * People active in a week who become regulars over the next few weeks,
 * compared with what's expected of people as active as them that week.
 */
export const getRegularOutcome = (): InsightOutcome => ({
  isHigherBetter: true,
  searchingLabel: t`Looking for what people who become regulars did…`,
  describeRate: (rate) => c("{0} is a percentage").t`${rate} became regulars`,
  describeComparison: (rate, expectedRate, size) =>
    c("{0} and {1} are percentages, {2} is a number of active weeks")
      .t`${rate} became regulars vs. ${expectedRate} expected for people as active · ${size} active weeks`,
  describeMultiple: (multiplier) =>
    c("{0} is a multiplier, like 2.5")
      .t`${multiplier}× as likely to become a regular`,
  describeDifference: (percent, isMore) =>
    isMore
      ? c("{0} is a percentage").t`${percent} more likely to become a regular`
      : c("{0} is a percentage").t`${percent} less likely to become a regular`,
  describeExcess: (count, formatted, isMore) =>
    isMore
      ? ngettext(
          msgid`About ${formatted} more regular than expected for people as active`,
          `About ${formatted} more regulars than expected for people as active`,
          count,
        )
      : ngettext(
          msgid`About ${formatted} fewer regular than expected for people as active`,
          `About ${formatted} fewer regulars than expected for people as active`,
          count,
        ),
  describeNothingFound: (events, size) =>
    c("{0} is a number of event conditions, {1} is a number of active weeks")
      .t`Nothing stands out. Checked ${events} event conditions across ${size} active weeks.`,
  noAttributesLabel: t`There are no event segments on this table to compare people by. Save some to see what regulars do.`,
  explore: {
    countColumn: "active_weeks",
    countTitle: t`Active weeks`,
    rateColumn: "became_regular",
    rateTitle: t`Became regulars`,
    expectedRateColumn: "expected_rate",
    expectedRateTitle: t`Expected for people as active`,
  },
});
