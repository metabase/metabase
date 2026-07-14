import { P, isMatching } from "ts-pattern";

import * as Urls from "metabase/urls";
import type { Card, CardDisplayType, DatasetQuery } from "metabase-types/api";
import { isCardDisplayType } from "metabase-types/api";

import { deserializeCardFromUrl } from "./card";

const ADHOC_QUESTION_HASH_REGEX = /\/question#([A-Za-z0-9_=-]+)/;

export type ChartClipboardPayload = Pick<
  Card,
  "name" | "dataset_query" | "visualization_settings"
> &
  Partial<Pick<Card, "description">> & {
    display: CardDisplayType;
  };

export function serializeChartClipboard(
  payload: ChartClipboardPayload,
  siteUrl: string,
): string {
  const path = Urls.card(
    { ...payload, displayIsLocked: true },
    { includeDisplayIsLocked: true },
  );
  return `${siteUrl.replace(/\/$/, "")}${path}`;
}

const CHART_CLIPBOARD_CARD_PATTERN = {
  display: P.when(isCardDisplayType),
  dataset_query: P.when(
    (value): value is DatasetQuery =>
      typeof value === "object" && value !== null,
  ),
};

export function parseChartClipboard(
  text: string | null | undefined,
): ChartClipboardPayload | null {
  const hash = text?.match(ADHOC_QUESTION_HASH_REGEX)?.[1];
  if (!hash) {
    return null;
  }
  try {
    const card: Card = deserializeCardFromUrl(hash);
    if (!isMatching(CHART_CLIPBOARD_CARD_PATTERN, card)) {
      return null;
    }
    return {
      name: card.name ?? "",
      description: card.description ?? undefined,
      display: card.display,
      dataset_query: card.dataset_query,
      visualization_settings: card.visualization_settings ?? {},
    };
  } catch {
    return null;
  }
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}
