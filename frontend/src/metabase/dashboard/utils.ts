import _ from "underscore";
import { t } from "ttag";
import Utils from "metabase/lib/utils";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import {
  getGenericErrorMessage,
  getPermissionErrorMessage,
} from "metabase/visualizations/lib/errors";
import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import {
  Card,
  CardId,
  DashCardId,
  Dashboard,
  DashboardOrderedCard,
  Database,
  Dataset,
  NativeDatasetQuery,
  Parameter,
  StructuredDatasetQuery,
} from "metabase-types/api";
import Question from "metabase-lib/Question";
import {
  isDateParameter,
  isNumberParameter,
  isStringParameter,
} from "metabase-lib/parameters/utils/parameter-type";

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
    ordered_cards: dashboard.ordered_cards?.map(dashcard => ({
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

export function expandInlineCard(card?: Card) {
  return {
    name: "",
    visualization_settings: {},
    ...card,
    id: _.uniqueId("card"),
  };
}

export function isVirtualDashCard(dashcard: DashboardOrderedCard) {
  return _.isObject(dashcard?.visualization_settings?.virtual_card);
}

export function getVirtualCardType(dashcard: DashboardOrderedCard) {
  return dashcard?.visualization_settings?.virtual_card?.display;
}

export function isLinkDashCard(dashcard: DashboardOrderedCard) {
  return getVirtualCardType(dashcard) === "link";
}

export function isNativeDashCard(dashcard: DashboardOrderedCard) {
  return dashcard.card && new Question(dashcard.card).isNative();
}

// For a virtual (text) dashcard without any parameters, returns a boolean indicating whether we should display the
// info text about parameter mapping in the card itself or as a tooltip.
export function showVirtualDashCardInfoText(
  dashcard: DashboardOrderedCard,
  isMobile: boolean,
) {
  if (isVirtualDashCard(dashcard)) {
    return isMobile || dashcard.size_y > 2 || dashcard.size_x > 5;
  } else {
    return true;
  }
}

export function getNativeDashCardEmptyMappingText(parameter: Parameter) {
  if (isDateParameter(parameter)) {
    return t`Add a date variable to this question to connect it to a dashboard filter.`;
  } else if (isNumberParameter(parameter)) {
    return t`Add a number variable to this question to connect it to a dashboard filter.`;
  } else if (isStringParameter(parameter)) {
    return t`Add a string variable to this question to connect it to a dashboard filter.`;
  } else {
    return t`Add a variable to this question to connect it to a dashboard filter.`;
  }
}

export function getAllDashboardCards(dashboard: Dashboard) {
  const results = [];
  if (dashboard) {
    for (const dashcard of dashboard.ordered_cards) {
      const cards = [dashcard.card].concat((dashcard as any).series || []);
      results.push(...cards.map(card => ({ card, dashcard })));
    }
  }
  return results;
}

export function hasDatabaseActionsEnabled(database: Database) {
  return database.settings?.["database-enable-actions"] ?? false;
}

export function getDashboardType(id: unknown) {
  if (id == null || typeof id === "object") {
    // HACK: support inline dashboards
    return "inline";
  } else if (Utils.isUUID(id)) {
    return "public";
  } else if (Utils.isJWT(id)) {
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

export function getDatasetQueryParams(
  datasetQuery: Partial<StructuredDatasetQuery & NativeDatasetQuery>,
) {
  const { type, query, native, parameters = [] } = datasetQuery;
  return { type, query, native, parameters };
}

export function isDashcardLoading(
  dashcard: DashboardOrderedCard,
  dashcardsData: Record<DashCardId, Record<CardId, Dataset | null>>,
) {
  if (isVirtualDashCard(dashcard)) {
    return false;
  }

  if (dashcardsData[dashcard.id] == null) {
    return true;
  }

  const cardData = Object.values(dashcardsData[dashcard.id]);
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
      icon: "key",
    };
  }

  const errors = datasets.map(s => s.error).filter(Boolean);
  if (errors.length > 0) {
    if (IS_EMBED_PREVIEW) {
      const message = errors[0]?.data || getGenericErrorMessage();
      return { message, icon: "warning" };
    }
    return {
      message: getGenericErrorMessage(),
      icon: "warning",
    };
  }

  return;
}

const isDashcardDataLoaded = (
  data?: Record<CardId, Dataset | null>,
): data is Record<CardId, Dataset> => {
  return data != null && Object.values(data).every(result => result != null);
};

const hasRows = (dashcardData: Record<CardId, Dataset>) => {
  const queryResults = dashcardData
    ? Object.values(dashcardData).filter(Boolean)
    : [];

  return (
    queryResults.length > 0 &&
    queryResults.every(queryResult => queryResult.data.rows.length > 0)
  );
};

const shouldHideCard = (
  dashcard: DashboardOrderedCard,
  dashcardData: Record<CardId, Dataset | null>,
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
  cards: DashboardOrderedCard[],
  dashcardsData: Record<DashCardId, Record<CardId, Dataset | null>>,
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
