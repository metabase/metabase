import { c, msgid, ngettext, t } from "ttag";

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
  describeNothingFound: (columns: number, size: string) => string;
  /** The explore query's columns: the size and rate of each segment. */
  explore: {
    countColumn: string;
    countTitle: string;
    rateColumn: string;
    rateTitle: string;
  };
};

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
  explore: {
    countColumn: "visits",
    countTitle: t`Visits`,
    rateColumn: "bounce_rate",
    rateTitle: t`Bounce rate`,
  },
});
