import type { ConfigType, Dayjs, OptionType, PluginFunc } from "dayjs";

// This is the copy of https://github.com/iamkun/dayjs/pull/2060 which implements parseZone
// which we rely on when using momentjs so we need this plugin to be able to migrate from momentjs
// @authors: LucaColonnello and all contributors from https://github.com/iamkun/dayjs/issues/651#issuecomment-763033265
// The colon is made optional with ':?' to support both '+0100' and '+01:00' timezone formats.

const REGEX_TIMEZONE_OFFSET_FORMAT = /^(.*)([+-])(\d{2}):?(\d{2})|(Z)$/;

const parseOffset = (dateString: string): RegExpMatchArray | null =>
  dateString.match(REGEX_TIMEZONE_OFFSET_FORMAT);

const formatOffset = (parsedOffset: RegExpMatchArray): number => {
  const [, , sign, tzHour, tzMinute] = parsedOffset;
  const uOffset = parseInt(tzHour, 10) * 60 + parseInt(tzMinute, 10);
  return sign === "+" ? uOffset : -uOffset;
};

/**
 * decorates dayjs in order to keep the utcOffset of the given date string
 * natively dayjs auto-converts to local time & losing utcOffset info.
 *
 * This plugins depends on the UTC plugin. To support the custom format option,
 * you will need the CustomParseFormat plugin too.
 */

const pluginFunc: PluginFunc = (_option, _dayjsClass, dayjsFactory) => {
  dayjsFactory.parseZone = function (
    date?: ConfigType,
    format?: OptionType,
    locale?: string,
    strict?: boolean,
  ): Dayjs {
    let parsedFormat = format;
    if (typeof parsedFormat === "string") {
      parsedFormat = { format: parsedFormat };
    }
    if (typeof date !== "string") {
      return dayjsFactory(date, parsedFormat, locale, strict);
    }
    const match = parseOffset(date);
    if (match === null) {
      return dayjsFactory(date, {
        // @ts-expect-error $offset is not defined in type definition, we'll keep it for guaranteed compatibility after migrating to ts
        $offset: 0,
      });
    }
    if (match[0] === "Z") {
      return dayjsFactory(
        date,
        {
          utc: true,
          ...(parsedFormat as object),
        },
        locale,
        strict,
      );
    }
    const [, dateTime] = match;
    const offset = formatOffset(match);

    // Fix millisecond parsing for timestamps with fewer than 3 decimal places
    // related issue https://github.com/iamkun/dayjs/issues/2459
    let adjustedDateTime = dateTime;
    const millisecondsMatch = dateTime.match(/(\.\d{1,2})$/);
    if (millisecondsMatch) {
      const [, ms] = millisecondsMatch;
      // Pad milliseconds to 3 digits (e.g., .01 -> .010, .1 -> .100)
      const paddedMs = ms.padEnd(4, "0"); // .xxx format
      adjustedDateTime = dateTime.replace(/\.\d{1,2}$/, paddedMs);
    }

    return dayjsFactory(
      adjustedDateTime,
      {
        // @ts-expect-error $offset is not defined in type definition, we'll keep it for guaranteed compatibility after migrating to ts
        $offset: offset,
        ...(parsedFormat as object),
      },
      locale,
      strict,
    );
  };
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default pluginFunc;
