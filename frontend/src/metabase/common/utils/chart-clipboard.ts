import type {
  CardDisplayType,
  DatasetQuery,
  UnsavedCard,
  VisualizationSettings,
} from "metabase-types/api";
import { isCardDisplayType } from "metabase-types/api";

import { deserializeCardFromUrl, serializeCardForUrl } from "./card";

export const CHART_CLIPBOARD_TYPE = "metabase/chart";

const ADHOC_QUESTION_HASH_REGEX = /\/question(?:\?[^#]*)?#([A-Za-z0-9_=-]+)/;
const CHART_ID_PARAM = "mb_chart_id";
const QUERY_ID_PARAM = "mb_query_id";
const CHART_ID_REGEX = new RegExp(`[?&]${CHART_ID_PARAM}=([^&#]+)`);
const QUERY_ID_REGEX = new RegExp(`[?&]${QUERY_ID_PARAM}=([^&#]+)`);

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
  const card: UnsavedCard & { name: string; description: string | null } = {
    name: payload.name,
    description: payload.description ?? null,
    display: payload.display,
    dataset_query: payload.dataset_query,
    visualization_settings: payload.visualization_settings,
  };
  const hash = serializeCardForUrl(card, { includeDisplayIsLocked: true });
  const params = new URLSearchParams();
  if (payload.chart_id) {
    params.set(CHART_ID_PARAM, payload.chart_id);
  }
  if (payload.query_id) {
    params.set(QUERY_ID_PARAM, payload.query_id);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return `${siteUrl.replace(/\/$/, "")}/question${query}#${hash}`;
}

export function parseChartClipboard(
  text: string | null | undefined,
): ChartClipboardPayload | null {
  const hash = text?.match(ADHOC_QUESTION_HASH_REGEX)?.[1];
  if (!hash) {
    return null;
  }
  const chartIdMatch = text?.match(CHART_ID_REGEX)?.[1];
  const queryIdMatch = text?.match(QUERY_ID_REGEX)?.[1];
  try {
    const card = deserializeCardFromUrl(hash);
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
      chart_id: chartIdMatch ? decodeURIComponent(chartIdMatch) : undefined,
      query_id: queryIdMatch ? decodeURIComponent(queryIdMatch) : undefined,
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
