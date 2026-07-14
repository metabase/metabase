import { P, isMatching } from "ts-pattern";

import * as Urls from "metabase/urls";
import { utf8_to_b64url } from "metabase/utils/encoding";
import { stableStringify } from "metabase/utils/objects";
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
    chart_id: string;
    query_id: string;
  };

export function serializeChartClipboard(
  payload: ChartClipboardPayload,
  siteUrl: string,
): string {
  const hash = utf8_to_b64url(
    stableStringify({
      ...payload,
      description: payload.description ?? undefined,
      displayIsLocked: true,
    }),
  );
  return `${siteUrl.replace(/\/$/, "")}${Urls.card(null, { hash })}`;
}

const CHART_CLIPBOARD_CARD_PATTERN = {
  chart_id: P.string.minLength(1),
  query_id: P.string.minLength(1),
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
    const card: Card & { chart_id?: unknown; query_id?: unknown } =
      deserializeCardFromUrl(hash);
    if (!isMatching(CHART_CLIPBOARD_CARD_PATTERN, card)) {
      return null;
    }
    return {
      name: card.name ?? "",
      description: card.description ?? undefined,
      display: card.display,
      dataset_query: card.dataset_query,
      visualization_settings: card.visualization_settings ?? {},
      chart_id: card.chart_id,
      query_id: card.query_id,
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
