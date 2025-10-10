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
  ];
}
