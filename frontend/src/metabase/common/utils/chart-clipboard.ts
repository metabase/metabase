import type {
  CardDisplayType,
  DatasetQuery,
  UnsavedCard,
  VisualizationSettings,
} from "metabase-types/api";
import { isCardDisplayType } from "metabase-types/api";

import { deserializeCardFromUrl, serializeCardForUrl } from "./card";

export const CHART_CLIPBOARD_TYPE = "metabase/chart";

const ADHOC_QUESTION_HASH_REGEX = /\/question#([A-Za-z0-9_=-]+)/;

/**
 * Self-contained clipboard representation of a Metabot-generated (ad-hoc) chart.
 * Field names mirror the `Card` shape so paste targets can build a card/query
 * directly. Copied to the clipboard as a real ad-hoc question URL (see
 * `serializeChartClipboard`) so it reads as a normal link when pasted outside of
 * Metabase, while still carrying the whole chart for our own paste targets.
 */
export type ChartClipboardPayload = {
  type: typeof CHART_CLIPBOARD_TYPE;
  version: 1;
  name: string;
  description?: string;
  display: CardDisplayType;
  dataset_query: DatasetQuery;
  visualization_settings: VisualizationSettings;
};

/**
 * Serializes a chart as a self-contained ad-hoc question URL
 * (`<siteUrl>/question#<base64>`). Pasted into a plain text field it reads as a
 * normal, clickable Metabase link; pasted into a chart-aware target it is
 * decoded back into the chart via `parseChartClipboard`.
 */
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
    };
  } catch {
    return null;
  }
}

/**
 * Maps a pasted chart to the fields needed to create a new question. Shared by
 * the dashboard and collection paste handlers; the destination (`collection_id`
 * or `dashboard_id`) is added by the caller.
 */
export function chartPayloadToNewCard(payload: ChartClipboardPayload) {
  return {
    name: payload.name,
    description: payload.description ?? null,
    display: payload.display,
    dataset_query: payload.dataset_query,
    visualization_settings: payload.visualization_settings,
  };
}

/**
 * Whether a paste landed in a text-entry element, in which case a global chart
 * paste handler should stand down and let the browser paste text normally.
 */
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
