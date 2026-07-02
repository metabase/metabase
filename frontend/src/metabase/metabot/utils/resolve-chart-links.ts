import { serializeCardForUrl } from "metabase/common/utils/card";
import type {
  CardDisplayType,
  DatasetQuery,
  UnsavedCard,
} from "metabase-types/api";

export type ConversationChart = {
  queries?: DatasetQuery[];
  visualization_settings?: { chart_type?: CardDisplayType };
};

export type ResolvedChartLink = {
  href: string;
  display?: CardDisplayType;
};

const CHART_LINK_REGEX = /^metabase:\/\/chart\/([A-Za-z0-9-]+)$/;

export function resolveChartLink(
  url: string | undefined,
  charts: Record<string, ConversationChart> | undefined,
): ResolvedChartLink | undefined {
  const chartId = url?.match(CHART_LINK_REGEX)?.[1];
  if (!chartId) {
    return undefined;
  }
  const query = charts?.[chartId]?.queries?.[0];
  if (!query) {
    return undefined;
  }
  const display = charts?.[chartId]?.visualization_settings?.chart_type;
  const card: UnsavedCard = {
    display: display ?? "table",
    dataset_query: query,
    visualization_settings: {},
  };
  const hash = serializeCardForUrl(card, { includeDisplayIsLocked: true });
  return { href: `/question#${hash}`, display };
}
