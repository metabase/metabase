// based on https://github.com/Garbee/Iso8601/blob/main/src/index.ts

/**
 * Years are represented from the gregorian calendar only
 * as 0000 to 9999. (If anyone has to worry about after 9999
 * with this code, I am deeply sorry.) Technically 0000 -
 * 1582 are not allowed by the standard except by mutual
 * agreement between parties. This is explicitly forced
 * when validating in order to ensure we are only working
 * with data browsers can reasonably parse and get correct.
 */
const yearPattern = /(?<year>158[3-9]|159\d|1[6-9]\d{2}|[2-9]\d{3})/;
/**
 * Months are always 2-digits in a non-index format.
 * This differs from JavaScripts Date constructor for
 * example where months are 0-11 rather than ISO's 1-12.
 */
const monthPattern = /(?<month>0[1-9]|1[0-2])/;
/**
 * Days are always 2 digits.
 * 01-09, 10-19, 20-29, 30-31.
 */
const dayPattern = /(?<day>0[1-9]|[12]\d|3[01])/;
/**
 * Hours are always 2 digits and in 24 hour time.
 * 00-23
 */
const hourPattern = /(?<hour>[01]\d|2[0-3])/;
/**
 * Minutes are always 2 digits.
 */
const minutePattern = /(?<minute>[0-5]\d)/;
/**
 * Seconds are always 2 digits.
 * 60 is used to represent leap seconds.
 */
const secondsPattern = /(?<seconds>([0-5]\d)|60)?/;
/**
 * Milliseconds have no defined precision.
 * Allowing for up to 9 since this gets to nanoseconds.
 * Going beyond nanoseconds seems unreasonable to expect:
 * https://nickb.dev/blog/iso8601-and-nanosecond-precision-across-languages/
 * From 0-999999999.
 * The period to denote them is required if MS are present.
 */
const millisecondsPattern = /(?:\.(?<milliseconds>\d{1,9}))?/;

/**
 * Timezone is complex and difficult to break down further
 * since it is all one group.
 * Gist of it is timezones have 4 possible modes:
 * * Positive Offset
 * * Negative Offset
 * * 'Z' string for UTC time (+00:00)
 * * Unqualified (not present) (meaning local time.)
 *
 * With subgroups this could be made to give specific
 * outputs like `positiveOffset`, `negativeOffset`, or
 * `utcString` for determining which timezone style is
 * present.
 * However, without a use-case this effort wasn't completed
 * only validated that it could be possible.
 *
 * This pattern technically allows a bit more than standards
 * currently have. Up to +14:45 and down to -12:45. Should
 * anyone care to correct this and make it more strict, go
 * ahead just add tests to prove it when you do.
 */
const fullTimeZonePattern =
  /(?<offset>([+]((0\d|1[0-3])(?::(00|15|30|45))?|14(?::00)?)|([-]((0\d|1[0-1])(?::(00|15|30|45))?|12(?::00)?)|Z))?)/;

/**
 * Pattern to determine if a full calendar date is present.
 */
const fullCalendarDatePattern =
  yearPattern.source +
  /-/.source +
  monthPattern.source +
  /-/.source +
  dayPattern.source;

/**
 * Pattern to validate a complete date and time string.
 */
const fullIso8601DateTimePattern =
  /^/.source +
  yearPattern.source +
  /-?/.source +
  monthPattern.source +
  /-?/.source +
  dayPattern.source +
  /T/.source +
  hourPattern.source +
  /:?/.source +
  minutePattern.source +
  /:?/.source +
  secondsPattern.source +
  millisecondsPattern.source +
  fullTimeZonePattern.source +
  /$/.source;

/**
 * Week date pattern: YYYY-Www or YYYY-Www-D
 * where w is the week number (01-53) and D is the day of week (1-7)
 */
const weekDatePattern =
  /^(?:158[3-9]|159\d|1[6-9]\d{2}|[2-9]\d{3})-W([0-4]\d|5[0-3])(-[1-7])?$/;

/**
 * Ordinal date pattern: YYYY-DDD
 * where DDD is the day of the year (001-366)
 */
const ordinalDatePattern =
  /^(?:158[3-9]|159\d|1[6-9]\d{2}|[2-9]\d{3})-([0-2]\d{2}|3[0-5]\d|36[0-6])$/;

/**
 * Space-separated datetime pattern: YYYY-MM-DD HH:MM:SS with optional milliseconds
 */
const spaceSeparatedDateTimePattern =
  /^/.source +
  yearPattern.source +
  /-/.source +
  monthPattern.source +
  /-/.source +
  dayPattern.source +
  / /.source +
  hourPattern.source +
  /:/.source +
  minutePattern.source +
  // seconds and milliseconds are optional
  /:?/.source +
  secondsPattern.source +
  millisecondsPattern.source +
  /$/.source;

const iso8601Date = new RegExp(`^${fullCalendarDatePattern}$`);
const isIso8601DateTime = new RegExp(fullIso8601DateTimePattern);
const isSpaceSeparatedDateTime = new RegExp(spaceSeparatedDateTimePattern);

/**
 * Compact date pattern: YYYYMMDD
 * where YYYY is year (1583-9999), MM is month (01-12), DD is day (01-31)
 */
const compactDatePattern =
  /^(?:158[3-9]|159\d|1[6-9]\d{2}|[2-9]\d{3})(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/;

export function isValidIso8601(value: string | number): boolean {
  const stringValue = String(value);
  return (
    iso8601Date.test(stringValue) ||
    isIso8601DateTime.test(stringValue) ||
    weekDatePattern.test(stringValue) ||
    ordinalDatePattern.test(stringValue) ||
    isSpaceSeparatedDateTime.test(stringValue) ||
    compactDatePattern.test(stringValue)
  );
}
