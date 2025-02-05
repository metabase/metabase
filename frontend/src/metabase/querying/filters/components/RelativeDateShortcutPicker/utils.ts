import { t } from "ttag";

import type { ShortcutGroup } from "./types";

export function getShortcutGroups(): ShortcutGroup[] {
  return [
    {
      columns: 2,
      shortcuts: [
        {
          label: t`Today`,
          value: { type: "relative", value: "current", unit: "day" },
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
          label: t`Week`,
          value: { type: "relative", value: -1, unit: "week" },
        },
        {
          label: t`Month`,
          value: { type: "relative", value: -1, unit: "month" },
        },
        {
          label: t`Year`,
          value: { type: "relative", value: -1, unit: "year" },
        },
      ],
    },
    {
      label: t`This`,
      columns: 3,
      shortcuts: [
        {
          label: t`Week`,
          value: { type: "relative", value: "current", unit: "week" },
        },
        {
          label: t`Month`,
          value: { type: "relative", value: "current", unit: "month" },
        },
        {
          label: t`Year`,
          value: { type: "relative", value: "current", unit: "year" },
        },
      ],
    },
  ];
}
