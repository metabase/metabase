import { match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import type {
  ContentDiagnosticsImbalancedFindingType,
  ContentDiagnosticsImbalancedUnit,
} from "metabase-types/api";

export function getImbalancedEmptyStateLabel(
  mode: ContentDiagnosticsImbalancedFindingType,
): string {
  return match(mode)
    .with("empty", () => t`No empty content found`)
    .with("sparse", () => t`No sparse content found`)
    .with("crowded", () => t`No crowded content found`)
    .exhaustive();
}

export function getContentCountLabel(
  count: number,
  unit: ContentDiagnosticsImbalancedUnit,
): string {
  return match(unit)
    .with("items", () =>
      ngettext(msgid`${count} item`, `${count} items`, count),
    )
    .with("dashcards", () =>
      ngettext(msgid`${count} dashcard`, `${count} dashcards`, count),
    )
    .with("rows", () => ngettext(msgid`${count} row`, `${count} rows`, count))
    .with("cards", () =>
      ngettext(msgid`${count} card`, `${count} cards`, count),
    )
    .with("tabs", () => ngettext(msgid`${count} tab`, `${count} tabs`, count))
    .exhaustive();
}
