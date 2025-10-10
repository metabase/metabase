import { t } from "ttag";

import type { FilterGroupItem } from "./types";

export function getFilterGroups(): FilterGroupItem[] {
  return [
    {
      label: t`Verification`,
      items: [
        {
          value: "verified",
          label: t`Verified`,
        },
        {
          value: "not-verified",
          label: t`Not verified`,
        },
      ],
    },
    {
      label: t`Location`,
      items: [
        {
          value: "dashboard",
          label: t`Dashboard`,
        },
        {
          value: "collection",
          label: t`Collection`,
        },
      ],
    },
    {
      label: t`Collection type`,
      items: [
        {
          value: "collection-official",
          label: t`Official`,
        },
        {
          value: "collection-not-official",
          label: t`Regular`,
        },
      ],
    },
  ];
}
