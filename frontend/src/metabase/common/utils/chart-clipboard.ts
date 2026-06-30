import type {
  CardDisplayType,
  DatasetQuery,
  VisualizationSettings,
} from "metabase-types/api";

export const CHART_CLIPBOARD_TYPE = "metabase/chart";

/**
 * Self-contained clipboard representation of a Metabot-generated (ad-hoc) chart.
 * Field names mirror the `Card` shape so paste targets can build a card/query
 * directly. Written as plain-text JSON so every paste consumer (dashboard,
 * document, collection, chat box) can read it without a custom MIME type.
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

export function serializeChartClipboard(
  payload: Omit<ChartClipboardPayload, "type" | "version">,
): string {
  return JSON.stringify({
    type: CHART_CLIPBOARD_TYPE,
    version: 1,
    ...payload,
  } satisfies ChartClipboardPayload);
}

export function parseChartClipboard(
  text: string | null | undefined,
): ChartClipboardPayload | null {
  if (!text || !text.includes(CHART_CLIPBOARD_TYPE)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isChartClipboardPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isChartClipboardPayload(
  value: unknown,
): value is ChartClipboardPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === CHART_CLIPBOARD_TYPE &&
    typeof candidate.display === "string" &&
    typeof candidate.dataset_query === "object" &&
    candidate.dataset_query !== null
  );
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
