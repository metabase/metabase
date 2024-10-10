import { createAction } from "@reduxjs/toolkit";
import type { Query } from "history";
import { getIn } from "icepick";
import { denormalize, normalize, schema } from "normalizr";

import {
  getDashCardBeforeEditing,
  getDashCardById,
  getDashboardById,
  getParameterValues,
} from "metabase/dashboard/selectors";
import {
  expandInlineDashboard,
  fetchDataOrError,
  getDashboardType,
  isQuestionDashCard,
} from "metabase/dashboard/utils";
import Dashboards from "metabase/entities/dashboards";
import type { Deferred } from "metabase/lib/promise";
import { defer } from "metabase/lib/promise";
import { createAsyncThunk } from "metabase/lib/redux";
import { equals } from "metabase/lib/utils";
import { uuid } from "metabase/lib/uuid";
import { addFields, addParamValues } from "metabase/redux/metadata";
import {
  AutoApi,
  CardApi,
  DashboardApi,
  EmbedApi,
  MetabaseApi,
  PublicApi,
  maybeUsePivotEndpoint,
} from "metabase/services";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getParameterValuesByIdFromQueryParams } from "metabase-lib/v1/parameters/utils/parameter-parsing";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import { applyParameters } from "metabase-lib/v1/queries/utils/card";
import type {
  Card,
  DashCardId,
  DashboardCard,
  DashboardId,
  Dataset,
  DatasetQuery,
  QuestionDashboardCard,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { DASHBOARD_SLOW_TIMEOUT } from "../constants";

// normalizr schemas
const dashcard = new schema.Entity("dashcard");
const dashboard = new schema.Entity("dashboard", {
  dashcards: [dashcard],
});

let fetchDashboardCancellation: Deferred | null;

export const fetchDashboard = createAsyncThunk(
  "metabase/dashboard/FETCH_DASHBOARD",
  async (
    {
      dashId,
      queryParams,
      options: { preserveParameters = false, clearCache = true } = {},
    }: {
      dashId: DashboardId;
      queryParams: Query;
      options?: {
        preserveParameters?: boolean;
        clearCache?: boolean;
      };
    },
    { getState, dispatch, rejectWithValue },
  ) => {
    if (fetchDashboardCancellation) {
      fetchDashboardCancellation.resolve();
    }
    fetchDashboardCancellation = defer();

    try {
      let entities;
      let result;
      const dashboardLoadId = uuid();

      const dashboardType = getDashboardType(dashId);
      const loadedDashboard = getDashboardById(getState(), dashId);

      if (!clearCache && loadedDashboard) {
        entities = {
          dashboard: { [dashId]: loadedDashboard },
          dashcard: Object.fromEntries(
            loadedDashboard.dashcards.map(id => [
              id,
              getDashCardById(getState(), id),
            ]),
          ),
        };
        result = denormalize(dashId, dashboard, entities);
      } else if (dashboardType === "public") {
        result = await PublicApi.dashboard(
          { uuid: dashId, dashboard_load_id: dashboardLoadId },
          { cancelled: fetchDashboardCancellation.promise },
        );
        result = {
          ...result,
          id: dashId,
          dashcards: result.dashcards.map((dc: DashboardCard) => ({
            ...dc,
            dashboard_id: dashId,
          })),
        };
      } else if (dashboardType === "embed") {
        result = await EmbedApi.dashboard(
          { token: dashId, dashboard_load_id: dashboardLoadId },
          { cancelled: fetchDashboardCancellation.promise },
        );
        result = {
          ...result,
          id: dashId,
          dashcards: result.dashcards.map((dc: DashboardCard) => ({
            ...dc,
            dashboard_id: dashId,
          })),
        };
      } else if (dashboardType === "transient") {
        const subPath = String(dashId).split("/").slice(3).join("/");
        const [entity, entityId] = subPath.split(/[/?]/);
        const [response] = await Promise.all([
          AutoApi.dashboard(
            { subPath, dashboard_load_id: dashboardLoadId },
            { cancelled: fetchDashboardCancellation.promise },
          ),
          dispatch(
            Dashboards.actions.fetchXrayMetadata({
              entity,
              entityId,
              dashboard_load_id: dashboardLoadId,
            }),
          ),
        ]);
        result = {
          ...response,
          id: dashId,
          dashcards: response.dashcards.map((dc: DashboardCard) => ({
            ...dc,
            dashboard_id: dashId,
          })),
        };
      } else if (dashboardType === "inline") {
        // HACK: this is horrible but the easiest way to get "inline" dashboards up and running
        // pass the dashboard in as dashboardId, and replace the id with [object Object] because
        // that's what it will be when cast to a string
        // Adding ESLint ignore because this is a hack and we should fix it.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        result = expandInlineDashboard(dashId);
        dashId = result.id = String(dashId);
      } else {
        const [response] = await Promise.all([
          DashboardApi.get(
            { dashId: dashId, dashboard_load_id: dashboardLoadId },
            { cancelled: fetchDashboardCancellation.promise },
          ),
          dispatch(
            Dashboards.actions.fetchMetadata({
              id: dashId,
              dashboard_load_id: dashboardLoadId,
            }),
          ),
        ]);
        result = response;
      }

      fetchDashboardCancellation = null;

      const isUsingCachedResults = entities != null;
      if (!isUsingCachedResults) {
        // copy over any virtual cards from the dashcard to the underlying card/question
        result.dashcards.forEach((card: DashboardCard) => {
          if (card.visualization_settings?.virtual_card) {
            card.card = Object.assign(
              card.card || {},
              card.visualization_settings.virtual_card,
            );
          }
        });
      }

      if (result.param_values) {
        await dispatch(addParamValues(result.param_values));
      }
      if (result.param_fields) {
        await dispatch(addFields(result.param_fields));
      }

      const lastUsedParametersValues = result["last_used_param_values"] ?? {};

      const parameterValuesById = preserveParameters
        ? getParameterValues(getState())
        : getParameterValuesByIdFromQueryParams(
            result.parameters ?? [],
            queryParams,
            lastUsedParametersValues,
          );

      entities = entities ?? normalize(result, dashboard).entities;

      return {
        entities,
        dashboard: result,
        dashboardId: result.id,
        parameterValues: parameterValuesById,
        preserveParameters,
      };
    } catch (error) {
      if (
        !(
          error as {
            isCancelled: boolean;
          }
        ).isCancelled
      ) {
        console.error(error);
      }
      return rejectWithValue(error);
    }
  },
);

export const MARK_CARD_AS_SLOW = "metabase/dashboard/MARK_CARD_AS_SLOW";
export const markCardAsSlow = createAction(MARK_CARD_AS_SLOW, (card: Card) => {
  return {
    payload: {
      id: card.id,
      result: true,
    },
  };
});

export const SET_DOCUMENT_TITLE = "metabase/dashboard/SET_DOCUMENT_TITLE";

export const setDocumentTitle = createAction<string>(SET_DOCUMENT_TITLE);

export const SET_SHOW_LOADING_COMPLETE_FAVICON =
  "metabase/dashboard/SET_SHOW_LOADING_COMPLETE_FAVICON";
export const setShowLoadingCompleteFavicon = createAction<boolean>(
  SET_SHOW_LOADING_COMPLETE_FAVICON,
);

export const FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/FETCH_DASHBOARD_CARD_DATA";

export const fetchDashboardCardDataAction = createAction<{
  currentTime: number;
  loadingIds: DashCardId[];
}>(FETCH_DASHBOARD_CARD_DATA);

export const FETCH_CARD_DATA_PENDING =
  "metabase/dashboard/FETCH_CARD_DATA/pending";
export const fetchCardDataPending = createAction(
  FETCH_CARD_DATA_PENDING,
  (dashcard_id: DashCardId) => ({ payload: { dashcard_id } }),
);

export const CANCEL_FETCH_CARD_DATA =
  "metabase/dashboard/CANCEL_FETCH_CARD_DATA";

const cardDataCancelDeferreds: Record<
  `${DashCardId},${DashboardCard["card_id"]}`,
  Deferred | null
> = {};

export function setFetchCardDataCancel(
  card_id: DashboardCard["card_id"],
  dashcard_id: DashCardId,
  deferred: Deferred | null,
) {
  cardDataCancelDeferreds[`${dashcard_id},${card_id}`] = deferred;
}

// machinery to support query cancellation
export const cancelFetchCardData = createAction(
  CANCEL_FETCH_CARD_DATA,
  (card_id: DashboardCard["card_id"], dashcard_id: DashCardId) => {
    const deferred = cardDataCancelDeferreds[`${dashcard_id},${card_id}`];
    if (deferred) {
      deferred.resolve();
      cardDataCancelDeferreds[`${dashcard_id},${card_id}`] = null;
    }
    return { payload: { dashcard_id, card_id } };
  },
);

// real dashcard ids are integers >= 1
function isNewDashcard(dashcard: DashboardCard) {
  return dashcard.id < 0;
}

function isNewAdditionalSeriesCard(
  card: Card,
  dashcard: QuestionDashboardCard,
) {
  return (
    card.id !== dashcard.card_id &&
    !dashcard.series?.some(s => s.id === card.id)
  );
}

type FetchCardDataActionArgs = {
  dashcard_id: DashCardId;
  card_id: DashboardCard["card_id"];
  result: Dataset | { error: unknown } | null;
  currentTime?: number;
};

type FetchCardDataActionReturned = {
  card: Card;
  dashcard: DashboardCard;
  options: {
    reload?: boolean;
    clearCache?: boolean;
    ignoreCache?: boolean;
    dashboardLoadId?: string;
  };
};

export const FETCH_CARD_DATA = "metabase/dashboard/FETCH_CARD_DATA";

const fetchCardDataAction = createAsyncThunk<
  FetchCardDataActionArgs,
  FetchCardDataActionReturned
>(
  FETCH_CARD_DATA,
  async function (
    {
      card,
      dashcard,
      options: { reload, clearCache, ignoreCache, dashboardLoadId } = {},
    },
    { dispatch, getState },
  ) {
    dispatch(fetchCardDataPending(dashcard.id));

    // If the dataset_query was filtered then we don't have permission to view this card, so
    // shortcircuit and return a fake 403
    if (!card.dataset_query) {
      return {
        dashcard_id: dashcard.id,
        card_id: card.id,
        result: { error: { status: 403 } },
      };
    }

    const dashboardType = getDashboardType(dashcard.dashboard_id);

    const { dashboardId, dashboards, parameterValues, dashcardData } =
      getState().dashboard;
    const dashboard = dashboardId ? dashboards[dashboardId] : null;

    // if we have a parameter, apply it to the card query before we execute
    const datasetQuery = applyParameters(
      card,
      dashboard?.parameters,
      parameterValues,
      dashcard?.parameter_mappings ?? undefined,
    );

    const lastResult = getIn(dashcardData, [dashcard.id, card.id]);
    if (!reload) {
      // if reload not set, check to see if the last result has the same query dict and return that
      if (
        lastResult &&
        equals(
          getDatasetQueryParams(lastResult.json_query),
          getDatasetQueryParams(datasetQuery),
        )
      ) {
        return {
          dashcard_id: dashcard.id,
          card_id: card.id,
          result: lastResult,
        };
      }
    }

    cancelFetchCardData(card.id, dashcard.id);

    // When dashcard parameters change, we need to clean previous (stale)
    // state so that the loader spinner shows as expected (#33767)
    const hasParametersChanged =
      !lastResult ||
      !equals(
        getDatasetQueryParams(lastResult.json_query).parameters,
        getDatasetQueryParams(datasetQuery).parameters,
      );

    if (clearCache || hasParametersChanged) {
      // clears the card data to indicate the card is reloading
      dispatch(clearCardData(card.id, dashcard.id));
    }

    let result:
      | Dataset
      | {
          error: unknown;
        }
      | null = null;

    // start a timer that will show the expected card duration if the query takes too long
    const slowCardTimer = setTimeout(() => {
      if (result === null) {
        dispatch(markCardAsSlow(card));
      }
    }, DASHBOARD_SLOW_TIMEOUT);

    const deferred = defer();
    setFetchCardDataCancel(card.id, dashcard.id, deferred);

    let cancelled = false;
    deferred.promise.then(() => {
      cancelled = true;
    });

    const queryOptions = {
      cancelled: deferred.promise,
    };

    // make the actual request
    if (datasetQuery.type === "endpoint") {
      result = await fetchDataOrError(
        MetabaseApi.datasetEndpoint(
          {
            endpoint: datasetQuery.endpoint,
            parameters: datasetQuery.parameters,
          },
          queryOptions,
        ),
      );
    } else if (dashboardType === "public") {
      result = await fetchDataOrError(
        maybeUsePivotEndpoint(PublicApi.dashboardCardQuery, card)(
          {
            uuid: dashcard.dashboard_id,
            dashcardId: dashcard.id,
            cardId: card.id,
            parameters: datasetQuery.parameters
              ? JSON.stringify(datasetQuery.parameters)
              : undefined,
            ignore_cache: ignoreCache,
          },
          queryOptions,
        ),
      );
    } else if (dashboardType === "embed") {
      result = await fetchDataOrError(
        maybeUsePivotEndpoint(EmbedApi.dashboardCardQuery, card)(
          {
            token: dashcard.dashboard_id,
            dashcardId: dashcard.id,
            cardId: card.id,
            parameters: JSON.stringify(
              getParameterValuesBySlug(dashboard?.parameters, parameterValues),
            ),
            ignore_cache: ignoreCache,
          },
          queryOptions,
        ),
      );
    } else if (dashboardType === "transient" || dashboardType === "inline") {
      result = await fetchDataOrError(
        maybeUsePivotEndpoint(MetabaseApi.dataset, card)(
          { ...datasetQuery, ignore_cache: ignoreCache },
          queryOptions,
        ),
      );
    } else {
      const dashcardBeforeEditing = getDashCardBeforeEditing(
        getState(),
        dashcard.id,
      );
      const hasReplacedCard =
        dashcard.card_id != null &&
        dashcardBeforeEditing &&
        dashcardBeforeEditing.card_id !== dashcard.card_id;

      const shouldUseCardQueryEndpoint =
        isNewDashcard(dashcard) ||
        (isQuestionDashCard(dashcard) &&
          isNewAdditionalSeriesCard(card, dashcard)) ||
        hasReplacedCard;

      // new dashcards and new additional series cards aren't yet saved to the dashboard, so they need to be run using the card query endpoint
      const endpoint = shouldUseCardQueryEndpoint
        ? CardApi.query
        : DashboardApi.cardQuery;

      const requestBody = shouldUseCardQueryEndpoint
        ? { cardId: card.id, ignore_cache: ignoreCache }
        : {
            dashboardId: dashcard.dashboard_id,
            dashcardId: dashcard.id,
            cardId: card.id,
            parameters: datasetQuery.parameters,
            ignore_cache: ignoreCache,
            dashboard_id: dashcard.dashboard_id,
            dashboard_load_id: dashboardLoadId,
          };

      result = await fetchDataOrError(
        maybeUsePivotEndpoint(endpoint, card)(requestBody, queryOptions),
      );
    }

    setFetchCardDataCancel(card.id, dashcard.id, null);
    clearTimeout(slowCardTimer);

    return {
      dashcard_id: dashcard.id,
      card_id: card.id,
      result: cancelled ? null : result,
      currentTime: performance.now(),
    };
  },
);

export const fetchCardData =
  (
    card: Card,
    dashcard: DashboardCard,
    options: {
      reload?: boolean;
      clearCache?: boolean;
      ignoreCache?: boolean;
      dashboardLoadId?: string;
    } = {},
  ) =>
  (dispatch: Dispatch) => {
    dispatch(fetchCardDataAction({ card, dashcard, options }));
  };

fetchCardData.fulfilled = fetchCardDataAction.fulfilled;

export const CLEAR_CARD_DATA = "metabase/dashboard/CLEAR_CARD_DATA";

export const clearCardData = createAction(
  CLEAR_CARD_DATA,
  (cardId, dashcardId) => ({ payload: { cardId, dashcardId } }),
);

function getDatasetQueryParams(datasetQuery: DatasetQuery) {
  const type = datasetQuery.type;
  if (type === "native") {
    return {
      type,
      native: datasetQuery.native,
      parameters: datasetQuery.parameters
        ?.map(parameter => ({
          ...parameter,
          value: parameter.value ?? null,
        }))
        .sort(sortById),
    };
  }

  return {
    type,
    query: datasetQuery.query,
  };
}

function sortById(a: UiParameter, b: UiParameter) {
  return a.id.localeCompare(b.id);
}
