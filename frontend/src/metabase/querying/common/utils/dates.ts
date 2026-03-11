import dayjs from "dayjs";
import { match } from "ts-pattern";
import { c, msgid, ngettext, t } from "ttag";

import { DEFAULT_TIME_STYLE } from "metabase/lib/formatting/datetime-utils";
import type {
  DateFilterDisplayOpts,
  DateFilterValue,
} from "metabase/querying/common/types";
import type { ExcludeDateFilterUnit } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { DateFormattingSettings } from "metabase-types/api";

export type { DateFilterDisplayOpts } from "metabase/querying/common/types";

export function getDateFilterDisplayName(
  value: DateFilterValue,
  { withPrefix, formattingSettings }: DateFilterDisplayOpts = {},
) {
  return match(value)
    .with(
      { type: "specific", operator: "=" },
      ({ values: [date], hasTime }) => {
        const dateText = formatDate(date, hasTime, formattingSettings);
        return withPrefix
          ? c("On a date. Example: On Jan 20.").t`On ${dateText}`
          : dateText;
      },
    )
    .with(
      { type: "specific", operator: "<" },
      ({ values: [date], hasTime }) => {
        return c("Before a date. Example: Before Jan 20.")
          .t`Before ${formatDate(date, hasTime, formattingSettings)}`;
      },
    )
    .with(
      { type: "specific", operator: ">" },
      ({ values: [date], hasTime }) => {
        return c("After a date. Example: After Jan 20.")
          .t`After ${formatDate(date, hasTime, formattingSettings)}`;
      },
    )
    .with(
      { type: "specific", operator: "between" },
      ({ values: [startDate, endDate], hasTime }) => {
        return `${formatDate(startDate, hasTime, formattingSettings)} - ${formatDate(endDate, hasTime, formattingSettings)}`;
      },
    )
    .with(
      { type: "relative" },
      ({ value, unit, offsetValue, offsetUnit, options }) => {
        if (offsetValue != null && offsetUnit != null) {
          const prefix = Lib.describeTemporalInterval(value, unit);
          const suffix = Lib.describeRelativeDatetime(offsetValue, offsetUnit);
          return `${prefix}, ${suffix}`;
        } else {
          return Lib.describeTemporalInterval(value, unit, {
            "include-current": options?.includeCurrent,
          });
        }
      },
    )
    .with({ type: "exclude", operator: "!=" }, ({ values, unit }) => {
      if (values.length <= 2 && unit != null) {
        const parts = values.map((value) => formatExcludeUnit(value, unit));
        return t`Exclude ${parts.join(", ")}`;
      } else {
        const count = values.length;
        return ngettext(
          msgid`Exclude ${count} selection`,
          `Exclude ${count} selections`,
          count,
        );
      }
    })
    .with({ type: "exclude", operator: "is-null" }, () => {
      return t`Is empty`;
    })
    .with({ type: "exclude", operator: "not-null" }, () => {
      return t`Not empty`;
    })
    .with({ type: "month" }, ({ month, year }) => {
      return formatMonth(month, year, formattingSettings);
    })
    .with({ type: "quarter" }, ({ quarter, year }) => {
      return formatQuarter(quarter, year);
    })
    .exhaustive();
}

export function formatDate(
  date: Date,
  hasTime: boolean,
  formattingSettings: DateFormattingSettings = {},
) {
  const format = formattingSettingsToFormatString(formattingSettings, hasTime);
  return dayjs(date).format(format);
}

function formattingSettingsToFormatString(
  formattingSettings: DateFormattingSettings = {},
  hasTime: boolean = false,
) {
  const { date_style = "LL", time_style = DEFAULT_TIME_STYLE } =
    formattingSettings;

  const format = hasTime ? `${date_style} ${time_style}` : date_style;
  return abbreviateFormat(format, formattingSettings);
}

function abbreviateFormat(
  format: string,
  formattingSettings: DateFormattingSettings = {},
) {
  if (!formattingSettings.date_abbreviate) {
    return format;
  }
  return format.replace(/MMMM/, "MMM").replace(/dddd/, "ddd");
}

function formatMonth(
  month: number,
  year: number,
  formattingSettings: DateFormattingSettings = {},
) {
  return dayjs()
    .year(year)
    .month(month - 1)
    .format(abbreviateFormat("MMMM YYYY", formattingSettings));
}

function formatQuarter(quarter: number, year: number) {
  return dayjs()
    .year(year)
    .quarter(quarter)
    .format(
      c(
        'This is a "dayjs" format string (https://day.js.org/docs/en/plugin/advanced-format). It should include "Q" for the quarter number, YYYY for the year, and raw text can be escaped by brackets. For example, "[Quarter] Q YYYY" will be rendered as "Quarter 1 2024".',
      ).t`[Q]Q YYYY`,
    );
}

function formatExcludeUnit(value: number, unit: ExcludeDateFilterUnit) {
  switch (unit) {
    case "hour-of-day":
      return dayjs().hour(value).format("h A");
    case "day-of-week":
      return dayjs().isoWeekday(value).format("dddd");
    case "month-of-year":
      return dayjs()
        .month(value - 1)
        .format("MMMM");
    case "quarter-of-year":
      return dayjs()
        .quarter(value)
        .format(
          c(
            'This is a "dayjs" format string (https://day.js.org/docs/en/plugin/advanced-format). It should include "Q" for the quarter number, and raw text can be escaped by brackets. For example, "[Quarter] Q" will be rendered as "Quarter 1".',
          ).t`[Q]Q`,
        );
  }
}
