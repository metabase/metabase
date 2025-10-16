import { t } from "ttag";

import type { SearchModelItem } from "./types";

export function getSearchModelItems(): SearchModelItem[] {
  return [
    {
      value: "table",
      label: t`Tables`,
    },
    {
      value: "card",
      label: t`Questions`,
    },
    {
      value: "dataset",
      label: t`Models`,
    },
    {
      value: "metric",
      label: t`Metrics`,
    },
    {
      value: "transform",
      label: t`Transforms`,
    },
  ];
}
