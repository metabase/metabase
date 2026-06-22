import { c, msgid, t } from "ttag";

import type { ShortcutGroup } from "./types";

export function getShortcutGroups(): ShortcutGroup[] {
  return [
    {
      columns: 2,
      shortcuts: [
        {
          label: t`Today`,
          value: { type: "relative", value: 0, unit: "day" },
        },
        {
          label: t`Yesterday`,
          value: { type: "relative", value: -1, unit: "day" },
        },
        {
          label: t`Previous 7 days`,
          value: { type: "relative", value: -7, unit: "day" },
        },
        {
          label: t`Previous 30 days`,
          value: { type: "relative", value: -30, unit: "day" },
        },
      ],
    },
    {
      label: t`Previous`,
      columns: 3,
      shortcuts: [
        {
          label: c("DatePicker").ngettext(msgid`Week`, `Weeks`, 1),
          value: { type: "relative", value: -1, unit: "week" },
        },
        {
          label: c("DatePicker").ngettext(msgid`Month`, `Months`, 1),
          value: { type: "relative", value: -1, unit: "month" },
        },
        {
          label: c("DatePicker").ngettext(msgid`Year`, `Years`, 1),
          value: { type: "relative", value: -1, unit: "year" },
        },
      ],
    },
    {
      label: t`This`,
      columns: 3,
      shortcuts: [
        {
          label: c("DatePicker").ngettext(msgid`Week`, `Weeks`, 1),
          value: { type: "relative", value: 0, unit: "week" },
        },
        {
          label: c("DatePicker").ngettext(msgid`Month`, `Months`, 1),
          value: { type: "relative", value: 0, unit: "month" },
        },
        {
          label: c("DatePicker").ngettext(msgid`Year`, `Years`, 1),
          value: { type: "relative", value: 0, unit: "year" },
        },
      ],
    },
  ];
}
