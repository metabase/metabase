import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import updateLocale from "dayjs/plugin/updateLocale";
import { c, t } from "ttag";

dayjs.extend(relativeTime);
dayjs.extend(updateLocale);

type RelativeTimeStrings = Record<string, string>;

export const getAbbreviatedRelativeTimeStrings = (): RelativeTimeStrings => ({
  s: c("Abbreviation for '{0} seconds. {0} is a number'").t`${"%d"}s`,
  m: c("Abbreviation for '1 minute'").t`1min`,
  mm: c("Abbreviation for '{0} minutes'. {0} is a number").t`${"%d"}min`,
  h: c("Abbreviation for '1 hour'").t`1h`,
  hh: c("Abbreviation for '{0} hours'. {0} is a number").t`${"%d"}h`,
  d: c("Abbreviation for '1 day'").t`1d`,
  dd: c("Abbreviation for '{0} days'. {0} is a number").t`${"%d"}d`,
  M: c("Abbreviation for '1 month'").t`1mo`,
  MM: c("Abbreviation for '{0} months'. {0} is a number").t`${"%d"}mo`,
  y: c("Abbreviation for '1 year'").t`1yr`,
  yy: c("Abbreviation for '{0} years'. {0} is a number").t`${"%d"}yr`,
});

/** @throws Error if timestamp is not a valid date */
export const getTimePassedSince = ({
  timestamp,
  relativeTimeStrings,
  withoutSuffix = true,
}: {
  timestamp?: string | null;
  relativeTimeStrings?: RelativeTimeStrings;
  withoutSuffix?: boolean;
}) => {
  const date = dayjs(timestamp);
  if (!timestamp || !date.isValid()) {
    throw new Error(t`Invalid date`);
  }
  if (relativeTimeStrings) {
    const locale = dayjs.locale();
    // Temporarily change the relative-time strings in the global dayjs instance
    const cachedRules = dayjs.Ls[locale].relativeTime;
    dayjs.updateLocale(locale, {
      relativeTime: relativeTimeStrings,
    });
    const timePassed = date.fromNow(withoutSuffix);
    dayjs.updateLocale(locale, { relativeTime: cachedRules });
    return timePassed;
  } else {
    return date.fromNow(withoutSuffix);
  }
};
