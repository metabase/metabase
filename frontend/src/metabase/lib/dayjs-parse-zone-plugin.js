// This is the copy of https://github.com/iamkun/dayjs/pull/2060 which implements parseZone
// which we rely on when using momentjs so we need this plugin to be able to migrate from momentjs
// @authors: LucaColonnello and all contributors from https://github.com/iamkun/dayjs/issues/651#issuecomment-763033265
const REGEX_TIMEZONE_OFFSET_FORMAT = /^(.*)([+-])(\d{2}):(\d{2})|(Z)$/;

const parseOffset = dateString =>
  dateString.match(REGEX_TIMEZONE_OFFSET_FORMAT);

const formatOffset = parsedOffset => {
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
const pluginFunc = (option, dayjsClass, dayjsFactory) => {
  dayjsFactory.parseZone = function (date, format, locale, strict) {
    if (typeof format === "string") {
      format = { format };
    }
    if (typeof date !== "string") {
      return dayjsFactory(date, format, locale, strict);
    }
    const match = parseOffset(date);
    if (match === null) {
      return dayjsFactory(date, {
        $offset: 0,
      });
    }
    if (match[0] === "Z") {
      return dayjsFactory(
        date,
        {
          utc: true,
          ...format,
        },
        locale,
        strict,
      );
    }
    const [, dateTime] = match;
    const offset = formatOffset(match);

    return dayjsFactory(
      dateTime,
      {
        $offset: offset,
        ...format,
      },
      locale,
      strict,
    );
  };
};

export default pluginFunc;
