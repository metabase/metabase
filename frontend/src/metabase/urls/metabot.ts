import { serializeCardForUrl } from "metabase/common/utils/card";
import type {
  CardDisplayType,
  DatasetQuery,
  UnsavedCard,
} from "metabase-types/api";

import { serializedQuestion } from "./questions";

export function newMetabotConversation({ prompt }: { prompt: string }) {
  return `/metabot/new?q=${encodeURIComponent(prompt)}`;
}

type GeneratedCardLink = {
  type: "card";
  query: { query: DatasetQuery };
  display?: CardDisplayType;
};

type GeneratedDashboardLink = {
  type: "dashboard";
  url: string;
};

type GeneratedEntityLink = GeneratedCardLink | GeneratedDashboardLink;

export function generatedCard(card: GeneratedCardLink) {
  const unsavedCard: UnsavedCard = {
    dataset_query: card.query.query,
    display: card.display ?? "table",
    visualization_settings: {},
    displayIsLocked: card.display != null,
  };
  return serializedQuestion(unsavedCard, { includeDisplayIsLocked: true });
}

export function generatedEntity(entity: GeneratedEntityLink) {
  switch (entity.type) {
    case "card":
      return generatedCard(entity);
    case "dashboard":
      return entity.url;
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
