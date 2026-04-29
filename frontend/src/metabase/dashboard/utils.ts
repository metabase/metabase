import type { Location } from "history";
import { getIn } from "icepick";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import type { SelectedTabId } from "metabase/redux/store";
import {
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/utils/dashboard";
import { SERVER_ERROR_TYPES } from "metabase/utils/errors";
import { isStaticEmbeddingEntityLoadingError } from "metabase/utils/errors/is-static-embedding-entity-loading-error";
import type { StaticEmbeddingEntityError } from "metabase/utils/errors/types";
import {
  getGenericErrorMessage,
  getPermissionErrorMessage,
} from "metabase/visualizations/lib/errors";
import { isVisualizerDashboardCard } from "metabase/visualizer/utils";
import Question from "metabase-lib/v1/Question";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  areParameterValuesIdentical,
  parameterHasNoDisplayValue,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  ActionDashboardCard,
  BaseDashboardCard,
  CacheableDashboard,
  Card,
  CardId,
  ClickBehavior,
  ColumnSettings,
  DashCardDataMap,
  Dashboard,
  DashboardCard,
  Database,
  Dataset,
  DatasetQuery,
  EmbedDataset,
  Parameter,
  ParameterId,
  QuestionDashboardCard,
  VirtualCard,
  VirtualDashboardCard,
} from "metabase-types/api";

export function syncParametersAndEmbeddingParams(before: any, after: any) {
  if (after.parameters && before.embedding_params && before.enable_embedding) {
    return Object.keys(before.embedding_params).reduce((memo, embedSlug) => {
      const slugParam = _.find(before.parameters, (param) => {
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
    dashcards: dashboard.dashcards?.map((dashcard) => ({
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

export function getInlineParameterTabMap(dashboard: Dashboard) {
  const { dashcards = [] } = dashboard;
  const parameters = dashboard.parameters ?? [];

  const result: Record<ParameterId, SelectedTabId> = {};

  parameters.forEach((parameter) => {
    const parentDashcard = findDashCardForInlineParameter(
      parameter.id,
      dashcards,
    );
    if (parentDashcard) {
      result[parameter.id] = parentDashcard.dashboard_tab_id ?? null;
    }
  });

  return result;
}

export function isNativeDashCard(dashcard: QuestionDashboardCard) {
  // The `dataset_query` is null for questions on a dashboard the user doesn't have access to
  if (dashcard.card.dataset_query == null) {
    return false;
  }
  const question = new Question(dashcard.card);
  return question.isNative();
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

export function getAllDashboardCards(dashboard: Dashboard) {
  const results = [];
  for (const dashcard of dashboard.dashcards) {
    const cards = [dashcard.card].concat((dashcard as any).series || []);
    results.push(...cards.map((card) => ({ card, dashcard })));
  }
  return results;
}

export function getCurrentTabDashboardCards(
  dashboard: Dashboard,
  selectedTabId: SelectedTabId,
) {
  return getAllDashboardCards(dashboard).filter(
    ({ dashcard }) =>
      (dashcard.dashboard_tab_id == null && selectedTabId == null) ||
      dashcard.dashboard_tab_id === selectedTabId,
  );
}

export function hasDatabaseActionsEnabled(database: Database) {
  return database.settings?.["database-enable-actions"] ?? false;
}

export async function fetchDataOrError<T>(dataPromise: Promise<T>) {
  try {
    return await dataPromise;
  } catch (error) {
    // For 4xx errors from streaming query endpoints, the error response body
    // contains the actual error data that should be displayed (just like the old
    // 202-with-error-in-body behavior). Treat these as successful responses.
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status < 500 &&
      "data" in error &&
      typeof error.data === "object"
    ) {
      // Return the error data as if it were a successful response
      return error.data;
    }
    // For 5xx errors or other errors, maintain the original behavior
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
  return cardData.length === 0 || cardData.some((data) => data == null);
}

export function getDashcardResultsError(
  datasets: Dataset[],
  isGuestEmbed: boolean,
) {
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

  const staticEntityLoadingError = datasets.find((dataset) =>
    isStaticEmbeddingEntityLoadingError(dataset.error, {
      isGuestEmbed,
    }),
  )?.error as StaticEmbeddingEntityError | undefined;

  if (staticEntityLoadingError) {
    return {
      message: staticEntityLoadingError.data,
      icon: "warning" as const,
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
    !getDashcardResultsError(Object.values(dashcardData), false)
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

export {
  createDashCard,
  createVirtualCard,
  generateTemporaryDashcardId,
  type NewDashboardCard,
} from "metabase/common/utils/dashboard";

export const isDashboardCacheable = (
  dashboard: Dashboard,
): dashboard is CacheableDashboard => typeof dashboard.id !== "string";

export function parseTabSlug(location: Location) {
  const slug = location.query?.tab;
  if (typeof slug === "string" && slug.length > 0) {
    const id = parseInt(slug, 10);
    return Number.isSafeInteger(id) ? id : null;
  }
  return null;
}

export function createTabSlug({
  id,
  name,
}: {
  id: SelectedTabId;
  name: string | undefined;
}) {
  if (id === null || id < 0 || !name) {
    return "";
  }
  return [id, ...name.toLowerCase().split(" ")].join("-");
}

export function canResetFilter(parameter: UiParameter): boolean {
  const hasDefaultValue = !parameterHasNoDisplayValue(parameter.default);
  const hasValue = !parameterHasNoDisplayValue(parameter.value);

  if (hasDefaultValue) {
    return !areParameterValuesIdentical(
      wrapArray(parameter.value),
      wrapArray(parameter.default),
    );
  }

  return hasValue;
}

function wrapArray<T>(value: T | T[]): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

export function getMappedParametersIds(
  dashcards: DashboardCard[],
): ParameterId[] {
  return dashcards.flatMap((dashcard: DashboardCard) => {
    const mappings = dashcard.parameter_mappings ?? [];
    return mappings.map((parameter) => parameter.parameter_id);
  });
}

/**
 * Reorders a dashboard header parameter within the full parameters array.
 *
 * Since `dashboard.parameters` includes both header and inline (dashcard) parameters,
 * this function ensures that the header parameters are correctly reordered while
 * maintaining the integrity of the full parameters array.
 */
export function setDashboardHeaderParameterIndex(
  parameters: Parameter[],
  headerParameterIds: ParameterId[],
  parameterId: ParameterId,
  index: number,
) {
  const headerIndex = headerParameterIds.indexOf(parameterId);
  const fullIndex = parameters.findIndex((p) => p.id === parameterId);

  if (headerIndex === -1 || fullIndex === -1 || headerIndex === index) {
    return parameters;
  }

  const reorderedHeaders = [...headerParameterIds];
  reorderedHeaders.splice(headerIndex, 1);
  reorderedHeaders.splice(index, 0, parameterId);

  let targetIndex = 0;

  if (index > 0) {
    const prevHeaderId = reorderedHeaders[index - 1];
    const prevIndex = parameters.findIndex((p) => p.id === prevHeaderId);
    if (prevIndex >= 0) {
      targetIndex = prevIndex + 1;
    }
  }

  const result = [...parameters];
  const [movedParam] = result.splice(fullIndex, 1);

  if (fullIndex < targetIndex) {
    targetIndex--;
  }

  result.splice(targetIndex, 0, movedParam);
  return result;
}

export function getClickBehaviorDescription(dashcard: DashboardCard) {
  const noBehaviorMessage = hasActionsMenu(dashcard)
    ? t`Open the drill-through menu`
    : t`Do nothing`;
  if (isTableDisplay(dashcard)) {
    const columnSettings: Record<string, ColumnSettings> =
      getIn(dashcard, ["visualization_settings", "column_settings"]) || {};

    const count = Object.values(columnSettings).filter(
      (settings) => settings.click_behavior != null,
    ).length;

    if (count === 0) {
      return noBehaviorMessage;
    }
    return ngettext(
      msgid`${count} column has custom behavior`,
      `${count} columns have custom behavior`,
      count,
    );
  }

  if (
    dashcard.visualization_settings == null ||
    dashcard.visualization_settings.click_behavior == null
  ) {
    return noBehaviorMessage;
  }

  const clickBehavior = dashcard.visualization_settings
    .click_behavior as ClickBehavior;

  if (clickBehavior.type === "link") {
    const { linkType } = clickBehavior;
    return linkType == null
      ? t`Go to...`
      : linkType === "dashboard"
        ? t`Go to dashboard`
        : linkType === "question"
          ? t`Go to question`
          : t`Go to url`;
  }

  return t`Filter this dashboard`;
}

function isEmptyDatasetQuery(
  datasetQuery: DatasetQuery | Record<string, never> | undefined | null,
): datasetQuery is Record<string, never> | undefined {
  return datasetQuery == null || Object.keys(datasetQuery).length === 0;
}

export function hasActionsMenu(dashcard: DashboardCard) {
  if (isEmptyDatasetQuery(dashcard.card.dataset_query)) {
    return false;
  }

  // This seems to work, but it isn't the right logic.
  // The right thing to do would be to check for any drills. However, we'd need a "clicked" object for that.
  const question = Question.create({
    dataset_query: dashcard.card.dataset_query,
  });
  return !question.isNative();
}

export function isTableDisplay(dashcard: DashboardCard) {
  return dashcard?.card?.display === "table";
}
