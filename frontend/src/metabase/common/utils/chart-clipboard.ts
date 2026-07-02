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

export const CHART_CLIPBOARD_TYPE = "metabase/chart";

const ADHOC_QUESTION_HASH_REGEX = /\/question#([A-Za-z0-9_=-]+)/;

export type ChartClipboardPayload = {
  type: typeof CHART_CLIPBOARD_TYPE;
  version: 1;
  name: string;
  description?: string;
  display: CardDisplayType;
  dataset_query: DatasetQuery;
  visualization_settings: VisualizationSettings;
  chart_id?: string;
  query_id?: string;
};

export function serializeChartClipboard(
  payload: Omit<ChartClipboardPayload, "type" | "version">,
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
      chart_id: payload.chart_id ?? undefined,
      query_id: payload.query_id ?? undefined,
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
      !isCardDisplayType(card.display) ||
      typeof card.dataset_query !== "object" ||
      card.dataset_query === null
    ) {
      return null;
    }
    return {
      type: CHART_CLIPBOARD_TYPE,
      version: 1,
      name: card.name ?? "",
      description: card.description ?? undefined,
      display: card.display,
      dataset_query: card.dataset_query,
      visualization_settings: card.visualization_settings ?? {},
      chart_id: typeof card.chart_id === "string" ? card.chart_id : undefined,
      query_id: typeof card.query_id === "string" ? card.query_id : undefined,
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
