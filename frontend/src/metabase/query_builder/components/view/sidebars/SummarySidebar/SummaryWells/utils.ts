import { t } from "ttag";

import * as Lib from "metabase-lib";

import type { SummaryDimensionItem, SummaryWellId } from "../types";

export const DROPDOWN_GAP_PX = 4;
export const DROPDOWN_MAX_HEIGHT_PX = 320;

export type DropdownFrame = {
  position: "bottom-start" | "top-start";
  width: number;
  offset: { mainAxis: number; crossAxis: number };
};

export function getCardFrame(field: HTMLElement): DropdownFrame | null {
  const card = field.parentElement;
  if (card == null) {
    return null;
  }
  const fieldRect = field.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const spaceBelow = window.innerHeight - cardRect.bottom;
  const isBelow =
    spaceBelow >= DROPDOWN_MAX_HEIGHT_PX || spaceBelow >= cardRect.top;
  return {
    position: isBelow ? "bottom-start" : "top-start",
    width: cardRect.width,
    offset: {
      mainAxis:
        (isBelow
          ? cardRect.bottom - fieldRect.bottom
          : fieldRect.top - cardRect.top) + DROPDOWN_GAP_PX,
      crossAxis: cardRect.left - fieldRect.left,
    },
  };
}

export function getFieldTexts(wellId: SummaryWellId, hasItems: boolean) {
  if (wellId === "values") {
    return {
      label: t`Add a value by name`,
      placeholder: hasItems ? t`Add a value…` : t`Type a metric or column`,
      noMatches: t`No matching metrics or columns`,
    };
  }
  return {
    label: t`Add a grouping by name`,
    placeholder: hasItems ? t`Add a column…` : t`Type a column`,
    noMatches: t`No matching columns`,
  };
}

export function getOptionValue(sectionKey: string, itemKey: string) {
  return `${sectionKey}/${itemKey}`;
}

export function splitBucketLabel(
  query: Lib.Query,
  stageIndex: number,
  { clause, label }: SummaryDimensionItem,
): { name: string; bucket: string } | null {
  const column = Lib.breakoutColumn(query, stageIndex, clause);
  if (column == null) {
    return null;
  }
  const unbucketedColumn = Lib.withTemporalBucket(
    Lib.withBinning(column, null),
    null,
  );
  const { longDisplayName } = Lib.displayInfo(
    query,
    stageIndex,
    unbucketedColumn,
  );
  const name = `${longDisplayName}: `;
  if (!label.startsWith(name) || label.length === name.length) {
    return null;
  }
  return { name, bucket: label.slice(name.length) };
}
