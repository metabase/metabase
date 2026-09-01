import type {
  GeneratedCard,
  GeneratedDashboard,
  GeneratedEntity,
} from "metabase/api/ai-streaming/schemas";
import { serializeCardForUrl } from "metabase/common/utils/card";
import type {
  CardDisplayType,
  DatasetQuery,
  UnsavedCard,
} from "metabase-types/api";

import { adhocDashboard } from "./dashboards";
import { serializedQuestion } from "./questions";

export function newMetabotConversation({ prompt }: { prompt: string }) {
  return `/metabot/new?q=${encodeURIComponent(prompt)}`;
}

export function generatedCard(card: GeneratedCard) {
  const unsavedCard: UnsavedCard = {
    dataset_query: card.query.query,
    display: card.display ?? "table",
    visualization_settings: {},
    displayIsLocked: card.display != null,
  };
  return serializedQuestion(unsavedCard, { includeDisplayIsLocked: true });
}

export function generatedDashboard(
  dashboard: GeneratedDashboard,
  conversationId?: string,
) {
  if ("url" in dashboard) {
    return dashboard.url;
  }
  return adhocDashboard({
    name: dashboard.title,
    description: dashboard.description,
    tiles: dashboard.tiles.map(({ query, ...tile }) => ({
      ...tile,
      dataset_query: query,
    })),
    metabot:
      conversationId != null
        ? { conversation_id: conversationId, dashboard_id: dashboard.id }
        : undefined,
  });
}

export function generatedEntity(
  entity: GeneratedEntity,
  { conversationId }: { conversationId?: string } = {},
) {
  switch (entity.type) {
    case "card":
      return generatedCard(entity);
    case "dashboard":
      return generatedDashboard(entity, conversationId);
  }
}

export const CONVERSATION_BASE_PATH = "metabot/conversation";

export function metabotConversation(conversationId: string) {
  return `/${CONVERSATION_BASE_PATH}/${conversationId}`;
}

export type ConversationChart = {
  queries?: DatasetQuery[];
  visualization_settings?: { chart_type?: CardDisplayType };
};

export const hasLinkableChartQuery = (chart: ConversationChart): boolean => {
  const query = chart.queries?.[0];
  return query != null && !("lib/type" in query);
};

export const conversationChartUrl = (
  chart: ConversationChart,
): string | undefined => {
  const query = chart.queries?.[0];
  if (query == null || !hasLinkableChartQuery(chart)) {
    return undefined;
  }
  const hash = serializeCardForUrl(
    {
      display: chart.visualization_settings?.chart_type ?? "table",
      dataset_query: query,
      visualization_settings: {},
      displayIsLocked: true,
    },
    { includeDisplayIsLocked: true },
  );
  return `/question#${hash}`;
};
