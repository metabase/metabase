import _ from "underscore";

import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import {
  getGenericErrorMessage,
  getPermissionErrorMessage,
} from "metabase/visualizations/lib/errors";
import { isVisualizerDashboardCard } from "metabase/visualizer/utils";
import type {
  ActionDashboardCard,
  BaseDashboardCard,
  CardId,
  DashCardDataMap,
  DashboardCard,
  DashboardCardLayoutAttrs,
  Dataset,
  EmbedDataset,
  ParameterId,
  QuestionDashboardCard,
  VirtualCard,
  VirtualCardDisplay,
  VirtualDashboardCard,
} from "metabase-types/api";

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
  dashcard: Pick<BaseDashboardCard, "visualization_settings">,
): dashcard is VirtualDashboardCard {
  return _.isObject(dashcard?.visualization_settings?.virtual_card);
}

export function getVirtualCardType(dashcard: BaseDashboardCard) {
  return dashcard?.visualization_settings?.virtual_card?.display;
}

export function isHeadingDashCard(
  dashcard: BaseDashboardCard,
): dashcard is VirtualDashboardCard {
  return getVirtualCardType(dashcard) === "heading";
}

export function isLinkDashCard(
  dashcard: BaseDashboardCard,
): dashcard is VirtualDashboardCard {
  return getVirtualCardType(dashcard) === "link";
}

export function isIFrameDashCard(
  dashcard: BaseDashboardCard,
): dashcard is VirtualDashboardCard {
  return getVirtualCardType(dashcard) === "iframe";
}

export function isNativeDashCard(dashcard: QuestionDashboardCard) {
  // The `dataset_query` is null for questions on a dashboard the user doesn't have access to
  return dashcard.card.dataset_query?.type === "native";
}

export function supportsInlineParameters(
  dashcard: BaseDashboardCard,
): dashcard is QuestionDashboardCard | VirtualDashboardCard {
  return isQuestionDashCard(dashcard) || isHeadingDashCard(dashcard);
}

type DashboardCardWithInlineFilters = (
  | VirtualDashboardCard
  | QuestionDashboardCard
) & {
  inline_parameters: ParameterId[];
};

export function hasInlineParameters(
  dashcard: BaseDashboardCard,
): dashcard is DashboardCardWithInlineFilters {
  return (
    supportsInlineParameters(dashcard) &&
    Array.isArray(dashcard.inline_parameters) &&
    dashcard.inline_parameters.length > 0
  );
}

export function findDashCardForInlineParameter(
  parameterId: ParameterId,
  dashcards: BaseDashboardCard[],
): DashboardCardWithInlineFilters | undefined {
  return dashcards.find((dashcard) => {
    if (hasInlineParameters(dashcard)) {
      return dashcard.inline_parameters.some((id) => id === parameterId);
    }
  }) as DashboardCardWithInlineFilters | undefined;
}

export function isDashcardInlineParameter(
  parameterId: ParameterId,
  dashcards: DashboardCard[],
) {
  return !!findDashCardForInlineParameter(parameterId, dashcards);
}

// For a virtual (text) dashcard without any parameters, returns a boolean indicating whether we should display the
// info text about parameter mapping in the card itself or as a tooltip.
export function showVirtualDashCardInfoText(
  dashcard: DashboardCard,
  isMobile: boolean,
) {
  const dashcardAreaSize = dashcard.size_y * dashcard.size_x;

  return isMobile || (dashcardAreaSize >= 12 && dashcard.size_x > 3);
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
  return cardData.length === 0 || cardData.some((data) => data == null);
}

export function getDashcardResultsError(datasets: Dataset[]) {
  const isAccessRestricted = datasets.some(
    (s) =>
      s.error_type === SERVER_ERROR_TYPES.missingPermissions ||
      (typeof s.error === "object" && s.error?.status === 403),
  );

  if (isAccessRestricted) {
    return {
      message: getPermissionErrorMessage(),
      icon: "key" as const,
    };
  }

  if (datasets.some((dataset) => dataset.error)) {
    const curatedErrorDataset = datasets.find(
      (dataset) => dataset.error && dataset.error_is_curated,
    );

    return {
      message:
        typeof curatedErrorDataset?.error === "string"
          ? curatedErrorDataset.error
          : getGenericErrorMessage(),
      icon: "warning" as const,
    };
  }

  return;
}

const isDashcardDataLoaded = (
  data?: Record<CardId, Dataset | null | undefined>,
): data is Record<CardId, Dataset> => {
  return data != null && Object.values(data).every((result) => result != null);
};

const hasRows = (dashcardData: Record<CardId, Dataset | EmbedDataset>) => {
  const queryResults = dashcardData
    ? Object.values(dashcardData).filter(Boolean)
    : [];

  return (
    queryResults.length > 0 &&
    queryResults.every(
      (queryResult) =>
        "data" in queryResult && queryResult.data.rows.length > 0,
    )
  );
};

const shouldHideCard = (
  dashcard: BaseDashboardCard,
  dashcardData: Record<CardId, Dataset | null | undefined>,
  wasVisible: boolean,
) => {
  const dashcardSettings = isVisualizerDashboardCard(dashcard)
    ? dashcard.visualization_settings?.visualization?.settings
    : dashcard.visualization_settings;
  const shouldHideEmpty = dashcardSettings?.["card.hide_empty"];

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
        (card) =>
          !shouldHideCard(
            card,
            dashcardsData[card.id],
            prevVisibleCardIds.has(card.id),
          ),
      )
      .map((c) => c.id),
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

export type NewDashboardCard = Omit<
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
    display,
    visualization_settings: {},
    archived: false,
  };
}
