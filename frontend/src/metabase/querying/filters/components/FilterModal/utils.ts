import { t } from "ttag";

import type { GroupItem } from "metabase/querying/filters/types";

export function getModalTitle(groupItems: GroupItem[]) {
  return groupItems.length === 1
    ? t`Filter ${groupItems[0].displayName} by`
    : t`Filter by`;
}

export function getModalWidth(groupItems: GroupItem[]) {
  const maxWidth = groupItems.length > 1 ? "70rem" : "55rem";
  return `min(98vw, ${maxWidth})`;
}
