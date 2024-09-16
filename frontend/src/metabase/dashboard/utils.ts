import _ from "underscore";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import {
  getGenericErrorMessage,
  getPermissionErrorMessage,
} from "metabase/visualizations/lib/errors";
import type {
  ActionDashboardCard,
  BaseDashboardCard,
  CacheableDashboard,
  Card,
  CardId,
  Dashboard,
  DashboardCard,
  DashboardCardLayoutAttrs,
  DashCardDataMap,
  Database,
  Dataset,
  EmbedDataset,
  QuestionDashboardCard,
  VirtualCard,
  VirtualCardDisplay,
  VirtualDashboardCard,
} from "metabase-types/api";
import type { SelectedTabId } from "metabase-types/store";

export function syncParametersAndEmbeddingParams(before: any, after: any) {
  if (after.parameters && before.embedding_params) {
    return Object.keys(before.embedding_params).reduce((memo, embedSlug) => {
      const slugParam = _.find(before.parameters, param => {
        return param.slug === embedSlug;
      });
      if (slugParam) {
        const slugParamId = slugParam && slugParam.id;
        const newParam = _.findWhere(after.parameters, { id: slugParamId });
        if (newParam) {
          memo[newParam.slug] = before.embedding_params[embedSlug];
        }
      }
      return memo;
    }, {} as any);
  } else {
    return before.embedding_params;
  }
}

// This adds default properties and placeholder IDs for an inline dashboard
export function expandInlineDashboard(dashboard: Partial<Dashboard>) {
  return {
    name: "",
    parameters: [],
    ...dashboard,
    dashcards: dashboard.dashcards?.map(dashcard => ({
      visualization_settings: {},
      parameter_mappings: [],
      ...dashcard,
      id: _.uniqueId("dashcard"),
      card: expandInlineCard(dashcard?.card),
      series: ((dashcard as any).series || []).map((card: Card) =>
        expandInlineCard(card),
      ),
    })),
  };
}

export function expandInlineCard(card?: Card | VirtualCard) {
  return {
    name: "",
    visualization_settings: {},
    ...card,
    id: _.uniqueId("card"),
  };
}

export function isQuestionCard(card: Card | VirtualCard) {
  return card.dataset_query != null;
}

export function isQuestionDashCard(
  dashcard: BaseDashboardCard,
): dashcard is QuestionDashboardCard {
  return (
    "card_id" in dashcard &&
    "card" in dashcard &&
    !isVirtualDashCard(dashcard) &&
    !isActionDashCard(dashcard)
  );
}

export function isActionDashCard(
  dashcard: BaseDashboardCard,
): dashcard is ActionDashboardCard {
  return "action" in dashcard;
}

export function isVirtualDashCard(
  dashcard: BaseDashboardCard,
): dashcard is VirtualDashboardCard {
  return _.isObject(dashcard?.visualization_settings?.virtual_card);
}

export function getVirtualCardType(dashcard: BaseDashboardCard) {
  return dashcard?.visualization_settings?.virtual_card?.display;
}

export function isLinkDashCard(
  dashcard: BaseDashboardCard,
): dashcard is VirtualDashboardCard {
  return getVirtualCardType(dashcard) === "link";
}

export function isNativeDashCard(dashcard: QuestionDashboardCard) {
  // The `dataset_query` is null for questions on a dashboard the user doesn't have access to
  return dashcard.card.dataset_query?.type === "native";
}

// For a virtual (text) dashcard without any parameters, returns a boolean indicating whether we should display the
// info text about parameter mapping in the card itself or as a tooltip.
export function showVirtualDashCardInfoText(
  dashcard: DashboardCard,
  isMobile: boolean,
) {
  if (isVirtualDashCard(dashcard)) {
    return isMobile || dashcard.size_y > 2 || dashcard.size_x > 5;
  } else {
    return true;
  }
}

export function getAllDashboardCards(dashboard: Dashboard) {
  const results = [];
  if (dashboard) {
    for (const dashcard of dashboard.dashcards) {
      const cards = [dashcard.card].concat((dashcard as any).series || []);
      results.push(...cards.map(card => ({ card, dashcard })));
    }
  }
  return results;
}

export function getCurrentTabDashboardCards(
  dashboard: Dashboard,
  selectedTabId: SelectedTabId,
  loadAllCards = false,
) {
  return getAllDashboardCards(dashboard).filter(
    ({ dashcard }) =>
      loadAllCards ||
      (dashcard.dashboard_tab_id == null && selectedTabId == null) ||
      dashcard.dashboard_tab_id === selectedTabId,
  );
}

export function hasDatabaseActionsEnabled(database: Database) {
  return database.settings?.["database-enable-actions"] ?? false;
}

export function getDashboardType(id: unknown) {
  if (id == null || typeof id === "object") {
    // HACK: support inline dashboards
    return "inline";
  } else if (isUuid(id)) {
    return "public";
  } else if (isJWT(id)) {
    return "embed";
  } else if (typeof id === "string" && /\/auto\/dashboard/.test(id)) {
    return "transient";
  } else {
    return "normal";
  }
}

export async function fetchDataOrError<T>(dataPromise: Promise<T>) {
  try {
    return await dataPromise;
  } catch (error) {
    return { error };
  }
}

export function isDashcardLoading(
  dashcard: BaseDashboardCard,
  dashcardsData: Record<CardId, Dataset | null | undefined>,
) {
  if (isVirtualDashCard(dashcard)) {
    return false;
  }

  if (dashcardsData == null) {
    return true;
  }

  const cardData = Object.values(dashcardsData);
  return cardData.length === 0 || cardData.some(data => data == null);
}

export function getDashcardResultsError(datasets: Dataset[]) {
  const isAccessRestricted = datasets.some(
    s =>
      s.error_type === SERVER_ERROR_TYPES.missingPermissions ||
      s.error?.status === 403,
  );

  if (isAccessRestricted) {
    return {
      message: getPermissionErrorMessage(),
      icon: "key" as const,
    };
  }

  const errors = datasets.map(s => s.error).filter(Boolean);
  if (errors.length > 0) {
    if (IS_EMBED_PREVIEW) {
      const message = errors[0]?.data || getGenericErrorMessage();
      return { message, icon: "warning" as const };
    }
    return {
      message: getGenericErrorMessage(),
      icon: "warning" as const,
    };
  }

  return;
}

const isDashcardDataLoaded = (
  data?: Record<CardId, Dataset | null | undefined>,
): data is Record<CardId, Dataset> => {
  return data != null && Object.values(data).every(result => result != null);
};

const hasRows = (dashcardData: Record<CardId, Dataset | EmbedDataset>) => {
  const queryResults = dashcardData
    ? Object.values(dashcardData).filter(Boolean)
    : [];

  return (
    queryResults.length > 0 &&
    queryResults.every(
      queryResult => "data" in queryResult && queryResult.data.rows.length > 0,
    )
  );
};

const shouldHideCard = (
  dashcard: BaseDashboardCard,
  dashcardData: Record<CardId, Dataset | null | undefined>,
  wasVisible: boolean,
) => {
  const shouldHideEmpty = dashcard.visualization_settings?.["card.hide_empty"];

  if (isVirtualDashCard(dashcard) || !shouldHideEmpty) {
    return false;
  }

  const isLoading = !isDashcardDataLoaded(dashcardData);

  if (isLoading) {
    return !wasVisible;
  }

  return (
    !hasRows(dashcardData) &&
    !getDashcardResultsError(Object.values(dashcardData))
  );
};

export const getVisibleCardIds = (
  cards: BaseDashboardCard[],
  dashcardsData: DashCardDataMap,
  prevVisibleCardIds = new Set<number>(),
) => {
  return new Set(
    cards
      .filter(
        card =>
          !shouldHideCard(
            card,
            dashcardsData[card.id],
            prevVisibleCardIds.has(card.id),
          ),
      )
      .map(c => c.id),
  );
};

export const getActionIsEnabledInDatabase = (
  card: ActionDashboardCard,
): boolean => {
  return !!card.action?.database_enabled_actions;
};

/**
 * When you remove a dashcard from a dashboard (either via removing or via moving it to another tab),
 * another dashcard can take its place. This small offset ensures that the grid will put this dashcard
 * in the correct place, pushing back down the other card.
 * This is a "best effort" solution, it doesn't always work but it's good enough for the most common case
 * see https://github.com/metabase/metabase/pull/35502
 */
export const calculateDashCardRowAfterUndo = (originalRow: number) =>
  originalRow - 0.1;

let tempId = -1;

export function generateTemporaryDashcardId() {
  return tempId--;
}

type NewDashboardCard = Omit<
  DashboardCard,
  "entity_id" | "created_at" | "updated_at"
>;

type MandatoryDashboardCardAttrs = Pick<
  DashboardCard,
  "dashboard_id" | "card"
> &
  DashboardCardLayoutAttrs;

export function createDashCard(
  attrs: Partial<NewDashboardCard> & MandatoryDashboardCardAttrs,
): NewDashboardCard {
  return {
    id: generateTemporaryDashcardId(),
    dashboard_tab_id: null,
    card_id: null,
    parameter_mappings: [],
    visualization_settings: {},
    ...attrs,
  };
}

export function createVirtualCard(display: VirtualCardDisplay): VirtualCard {
  return {
    name: null,
    dataset_query: {},
    display,
    visualization_settings: {},
    archived: false,
  };
}

export const isDashboardCacheable = (
  dashboard: Dashboard,
): dashboard is CacheableDashboard => typeof dashboard.id !== "string";
