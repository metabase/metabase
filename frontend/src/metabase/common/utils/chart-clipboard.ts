import { utf8_to_b64url } from "metabase/utils/encoding";
import { stableStringify } from "metabase/utils/objects";
import type {
  Card,
  CardDisplayType,
  DatasetQuery,
  VisualizationSettings,
} from "metabase-types/api";
import { isCardDisplayType } from "metabase-types/api";

import { deserializeCardFromUrl } from "./card";

const ADHOC_QUESTION_HASH_REGEX = /\/question#([A-Za-z0-9_=-]+)/;

export type ChartClipboardPayload = {
  name: string;
  description?: string;
  display: CardDisplayType;
  dataset_query: DatasetQuery;
  visualization_settings: VisualizationSettings;
  chart_id: string;
  query_id: string;
};

export function serializeChartClipboard(
  payload: ChartClipboardPayload,
  siteUrl: string,
): string {
  const hash = utf8_to_b64url(
    stableStringify({
      name: payload.name,
      description: payload.description ?? undefined,
      display: payload.display,
      dataset_query: payload.dataset_query,
      visualization_settings: payload.visualization_settings,
      displayIsLocked: true,
      chart_id: payload.chart_id,
      query_id: payload.query_id,
    }),
  );
  return `${siteUrl.replace(/\/$/, "")}/question#${hash}`;
}

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
    if (
      typeof card.chart_id !== "string" ||
      card.chart_id === "" ||
      typeof card.query_id !== "string" ||
      card.query_id === "" ||
      !isCardDisplayType(card.display) ||
      typeof card.dataset_query !== "object" ||
      card.dataset_query === null
    ) {
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
