import { createAction } from "@reduxjs/toolkit";
import { getIn } from "icepick";
import { denormalize, normalize, schema } from "normalizr";
import { t } from "ttag";

import { automagicDashboardsApi, dashboardApi } from "metabase/api";
import { showAutoApplyFiltersToast } from "metabase/dashboard/actions/parameters";
import { DASHBOARD_SLOW_TIMEOUT } from "metabase/dashboard/constants";
import {
  getCanShowAutoApplyFiltersToast,
  getDashCardBeforeEditing,
  getDashCardById,
  getDashboardById,
  getDashboardComplete,
  getLoadingDashCards,
  getParameterValues,
  getSelectedTabId,
} from "metabase/dashboard/selectors";
import {
  expandInlineDashboard,
  fetchDataOrError,
  getAllDashboardCards,
  getCurrentTabDashboardCards,
  getDashboardType,
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/dashboard/utils";
import { entityCompatibleQuery } from "metabase/lib/entities";
import type { Deferred } from "metabase/lib/promise";
import { defer } from "metabase/lib/promise";
import { createAsyncThunk, createThunkAction } from "metabase/lib/redux";
import { equals } from "metabase/lib/utils";
import { uuid } from "metabase/lib/uuid";
import { getSavedDashboardUiParameters } from "metabase/parameters/utils/dashboards";
import { addFields } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import {
  AutoApi,
  CardApi,
  DashboardApi,
  EmbedApi,
  MetabaseApi,
  PublicApi,
  maybeUsePivotEndpoint,
} from "metabase/services";
import { isVisualizerDashboardCard } from "metabase/visualizer/utils";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getParameterValuesByIdFromQueryParams } from "metabase-lib/v1/parameters/utils/parameter-parsing";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import { applyParameters } from "metabase-lib/v1/queries/utils/card";
import type {
  Card,
  CardId,
  DashCardId,
  Dashboard,
  DashboardCard,
  DashboardId,
  Dataset,
  JsonQuery,
  ParameterValuesMap,
  QuestionDashboardCard,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

export const FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/FETCH_DASHBOARD_CARD_DATA";
export const fetchDashboardCardDataAction = createAction<{
  currentTime: number;
  loadingIds: DashCardId[];
}>(FETCH_DASHBOARD_CARD_DATA);

export const CANCEL_FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/CANCEL_FETCH_DASHBOARD_CARD_DATA";

export const FETCH_CARD_DATA = "metabase/dashboard/FETCH_CARD_DATA";
export const ADD_DASHCARD_IDS_TO_LOADING_QUEUE =
  "metabase/dashboard/ADD_DASHCARD_IDS_TO_LOADING_QUEUE";
export const addDashcardIdsToLoadingQueue = createAction(
  ADD_DASHCARD_IDS_TO_LOADING_QUEUE,
  (dashcard_id, card_id) => ({
    payload: {
      dashcard_id,
      card_id,
    },
  }),
);

export const CANCEL_FETCH_CARD_DATA =
  "metabase/dashboard/CANCEL_FETCH_CARD_DATA";

export const CLEAR_CARD_DATA = "metabase/dashboard/CLEAR_CARD_DATA";

export const SET_LOADING_DASHCARDS_COMPLETE =
  "metabase/dashboard/SET_LOADING_DASHCARDS_COMPLETE";

// real dashcard ids are integers >= 1
function isNewDashcard(dashcard: DashboardCard) {
  return dashcard.id < 0;
}

function isNewAdditionalSeriesCard(
  card: Card,
  dashcard: QuestionDashboardCard,
  dashcardBeforeEditing?: DashboardCard,
) {
  if (isVisualizerDashboardCard(dashcard)) {
    if (!dashcardBeforeEditing || !("series" in dashcardBeforeEditing)) {
      return false;
    }

    const prevSeries = dashcardBeforeEditing.series ?? [];
    const newSeries = dashcard.series ?? [];

    return (
      card.id !== dashcard.card_id &&
      !prevSeries.some((s) => s.id === card.id) &&
      newSeries.some((s) => s.id === card.id)
    );
  }

  return (
    card.id !== dashcard.card_id &&
    !dashcard.series?.some((s) => s.id === card.id)
  );
}

export const SET_DOCUMENT_TITLE = "metabase/dashboard/SET_DOCUMENT_TITLE";
export const setDocumentTitle = createAction<string>(SET_DOCUMENT_TITLE);

const updateLoadingTitle = createThunkAction(
  SET_DOCUMENT_TITLE,
  (totalCards) => (_dispatch, getState) => {
    const loadingDashCards = getLoadingDashCards(getState());
    const loadingComplete = totalCards - loadingDashCards.loadingIds.length;
    return `${loadingComplete}/${totalCards} loaded`;
  },
);

export const SET_SHOW_LOADING_COMPLETE_FAVICON =
  "metabase/dashboard/SET_SHOW_LOADING_COMPLETE_FAVICON";
export const setShowLoadingCompleteFavicon = createAction<boolean>(
  SET_SHOW_LOADING_COMPLETE_FAVICON,
);

const loadingComplete = createThunkAction(
  SET_LOADING_DASHCARDS_COMPLETE,
  () => (dispatch, getState) => {
    dispatch(setShowLoadingCompleteFavicon(true));

    if (!document.hidden) {
      dispatch(setDocumentTitle(""));
      setTimeout(() => {
        dispatch(setShowLoadingCompleteFavicon(false));
      }, 3000);
    } else {
      dispatch(setDocumentTitle(t`Your dashboard is ready`));
      document.addEventListener(
        "visibilitychange",
        () => {
          dispatch(setDocumentTitle(""));
          setTimeout(() => {
            dispatch(setShowLoadingCompleteFavicon(false));
          }, 3000);
        },
        { once: true },
      );
    }

    if (getCanShowAutoApplyFiltersToast(getState())) {
      dispatch(showAutoApplyFiltersToast());
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

type FetchCardDataActionArgs = {
  card: Card;
  dashcard: DashboardCard;
  options: {
    clearCache?: boolean;
    ignoreCache?: boolean;
    reload?: boolean;
    dashboardLoadId?: string;
  };
};

type FetchCardDataActionReturned =
  | {
      dashcard_id: DashCardId;
      card_id: CardId;
      result: Dataset | { error: unknown } | null;
      currentTime?: number;
    }
  | undefined;

export const fetchCardDataAction = createAsyncThunk<
  FetchCardDataActionReturned,
  FetchCardDataActionArgs
>(
  FETCH_CARD_DATA,
  async (
    {
      card,
      dashcard,
      options: { reload, clearCache, ignoreCache, dashboardLoadId } = {},
    },
    { dispatch, getState },
  ) => {
    dispatch(addDashcardIdsToLoadingQueue(dashcard.id, card.id));

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

    const {
      dashboardId,
      dashboards,
      editingDashboard,
      parameterValues,
      dashcardData,
    } = getState().dashboard;

    if (!dashboardId) {
      return;
    }

    const dashboard = dashboards[dashboardId];

    // if the dashboard is being edited, ignore parameters that do not exist in
    // the saved dashboard to avoid query errors
    const savedParameterIds = new Set(
      editingDashboard?.parameters?.map((parameter) => parameter.id),
    );
    const savedParameters =
      editingDashboard != null
        ? dashboard.parameters?.filter((parameter) =>
            savedParameterIds.has(parameter.id),
          )
        : dashboard.parameters;

    // if we have a parameter, apply it to the card query before we execute
    const datasetQuery = applyParameters(
      card,
      savedParameters,
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
        getDatasetQueryParams(lastResult.json_query),
        getDatasetQueryParams(datasetQuery),
      );

    if (clearCache || hasParametersChanged) {
      // clears the card data to indicate the card is reloading
      dispatch(clearCardData(card.id, dashcard.id));
    }

    let result: Dataset | { error: unknown } | null = null;

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

    const metadata = getMetadata(getState());
    const queryOptions = {
      cancelled: deferred.promise,
    };

    // make the actual request
    if (datasetQuery.type === "endpoint") {
      result = (await fetchDataOrError(
        MetabaseApi.datasetEndpoint(
          {
            endpoint: datasetQuery.endpoint,
            parameters: datasetQuery.parameters,
          },
          queryOptions,
        ),
      )) as Dataset | { error: unknown } | null;
    } else if (dashboardType === "public") {
      result = await fetchDataOrError(
        maybeUsePivotEndpoint(
          PublicApi.dashboardCardQuery,
          card,
          metadata,
        )(
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
        maybeUsePivotEndpoint(
          EmbedApi.dashboardCardQuery,
          card,
          metadata,
        )(
          {
            token: dashcard.dashboard_id,
            dashcardId: dashcard.id,
            cardId: card.id,
            parameters: JSON.stringify(
              getParameterValuesBySlug(dashboard.parameters, parameterValues),
            ),
            ignore_cache: ignoreCache,
          },
          queryOptions,
        ),
      );
    } else if (dashboardType === "transient" || dashboardType === "inline") {
      result = await fetchDataOrError(
        maybeUsePivotEndpoint(
          MetabaseApi.dataset,
          card,
          metadata,
        )({ ...datasetQuery, ignore_cache: ignoreCache }, queryOptions),
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
          isNewAdditionalSeriesCard(card, dashcard, dashcardBeforeEditing)) ||
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
        maybeUsePivotEndpoint(
          endpoint,
          card,
          metadata,
        )(requestBody, queryOptions),
      );
    }

    // If the request was not previously cancelled, then clear the defer for the card
    if (!cancelled) {
      setFetchCardDataCancel(card.id, dashcard.id, null);
    }
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
    card: FetchCardDataActionArgs["card"],
    dashcard: FetchCardDataActionArgs["dashcard"],
    options: FetchCardDataActionArgs["options"] = {},
  ) =>
  async (dispatch: Dispatch) => {
    await dispatch(
      fetchCardDataAction({
        card,
        dashcard,
        options,
      }),
    );
  };

export const fetchDashboardCardData =
  ({ isRefreshing = false, reload = false, clearCache = false } = {}) =>
  (dispatch: Dispatch, getState: GetState) => {
    const dashboard = getDashboardComplete(getState());
    if (!dashboard) {
      return;
    }

    const selectedTabId = getSelectedTabId(getState());
    const dashboardLoadId = uuid();
    const loadingIds = getLoadingDashCards(getState()).loadingIds;
    const nonVirtualDashcards = getCurrentTabDashboardCards(
      dashboard,
      selectedTabId,
    ).filter(({ dashcard }) => !isVirtualDashCard(dashcard));

    let nonVirtualDashcardsToFetch = [];
    if (isRefreshing) {
      nonVirtualDashcardsToFetch = nonVirtualDashcards.filter(
        ({ dashcard }) => {
          return !loadingIds.includes(dashcard.id);
        },
      );
      const newLoadingIds = nonVirtualDashcardsToFetch.map(({ dashcard }) => {
        return dashcard.id;
      });

      dispatch(
        fetchDashboardCardDataAction({
          currentTime: performance.now(),
          loadingIds: loadingIds.concat(newLoadingIds),
        }),
      );
    } else {
      nonVirtualDashcardsToFetch = nonVirtualDashcards;
      const newLoadingIds = nonVirtualDashcardsToFetch.map(({ dashcard }) => {
        return dashcard.id;
      });

      for (const id of loadingIds) {
        const dashcard = getDashCardById(getState(), id);
        dispatch(cancelFetchCardData(dashcard.card.id, dashcard.id));
      }

      dispatch(
        fetchDashboardCardDataAction({
          currentTime: performance.now(),
          loadingIds: newLoadingIds,
        }),
      );
    }

    const promises = nonVirtualDashcardsToFetch.map(
      async ({ card, dashcard }) => {
        await dispatch(
          // TODO: fix the return type of getAllDashboardCards to make sure
          // that the relationship between a dashcard and its card
          // is actually reflected in the type system
          fetchCardData(card as Card, dashcard, {
            reload,
            clearCache,
            dashboardLoadId,
          }),
        );
        await dispatch(updateLoadingTitle(nonVirtualDashcardsToFetch.length));
      },
    );

    if (nonVirtualDashcardsToFetch.length > 0) {
      dispatch(
        setDocumentTitle(t`0/${nonVirtualDashcardsToFetch.length} loaded`),
      );

      // TODO: There is a race condition here, when refreshing a dashboard before
      // the previous API calls finished.
      return Promise.all(promises).then(() => {
        dispatch(loadingComplete());
      });
    }
  };

export const reloadDashboardCards =
  () => async (dispatch: Dispatch, getState: GetState) => {
    const dashboard = getDashboardComplete(getState());

    if (!dashboard) {
      return;
    }

    const reloads = getAllDashboardCards(dashboard)
      .filter(({ dashcard }) => !isVirtualDashCard(dashcard))
      .map(({ card, dashcard }) =>
        dispatch(
          // TODO: fix the return type of getAllDashboardCards to make sure
          // that the relationship between a dashcard and its card
          // is actually reflected in the type system
          fetchCardData(card as Card, dashcard, {
            reload: true,
            ignoreCache: true,
          }),
        ),
      );

    await Promise.all(reloads);
  };

export const cancelFetchDashboardCardData = createThunkAction(
  CANCEL_FETCH_DASHBOARD_CARD_DATA,
  () => (dispatch, getState) => {
    const dashboard = getDashboardComplete(getState());

    if (!dashboard) {
      return;
    }

    for (const { card, dashcard } of getAllDashboardCards(dashboard)) {
      dispatch(cancelFetchCardData(card.id, dashcard.id));
    }
  },
);

const cardDataCancelDeferreds: Record<
  `${DashCardId},${DashboardCard["card_id"]}`,
  Deferred | null
> = {};

function setFetchCardDataCancel(
  card_id: DashboardCard["card_id"],
  dashcard_id: DashCardId,
  deferred: Deferred | null,
) {
  cardDataCancelDeferreds[`${dashcard_id},${card_id}`] = deferred;
}

// machinery to support query cancellation
export const cancelFetchCardData = createAction(
  CANCEL_FETCH_CARD_DATA,
  (card_id, dashcard_id) => {
    const deferred = cardDataCancelDeferreds[`${dashcard_id},${card_id}`];
    if (deferred) {
      deferred.resolve();
      cardDataCancelDeferreds[`${dashcard_id},${card_id}`] = null;
    }
    return { payload: { dashcard_id, card_id } };
  },
);

export const clearCardData = createAction(
  CLEAR_CARD_DATA,
  (cardId, dashcardId) => ({ payload: { cardId, dashcardId } }),
);

function getDatasetQueryParams(datasetQuery?: JsonQuery) {
  const parameters = datasetQuery?.parameters ?? [];
  return parameters
    .map((parameter) => ({
      ...parameter,
      value: parameter.value ?? null,
    }))
    .sort(sortById);
}

function sortById(a: UiParameter, b: UiParameter) {
  return a.id.localeCompare(b.id);
}

// normalizr schemas
const dashcardSchema = new schema.Entity("dashcard");
const dashboardSchema = new schema.Entity("dashboard", {
  dashcards: [dashcardSchema],
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
      queryParams: ParameterValuesMap;
      options?: { preserveParameters?: boolean; clearCache?: boolean };
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
            loadedDashboard.dashcards.map((id) => [
              id,
              getDashCardById(getState(), id),
            ]),
          ),
        };
        result = denormalize(dashId, dashboardSchema, entities);
      } else if (dashboardType === "public") {
        const response = (await PublicApi.dashboard(
          { uuid: dashId, dashboard_load_id: dashboardLoadId },
          { cancelled: fetchDashboardCancellation.promise },
        )) as Dashboard;
        result = {
          ...response,
          id: dashId,
          dashcards: response.dashcards.map((dc: DashboardCard) => ({
            ...dc,
            dashboard_id: dashId,
          })),
        };
      } else if (dashboardType === "embed") {
        const response = (await EmbedApi.dashboard(
          { token: dashId, dashboard_load_id: dashboardLoadId },
          { cancelled: fetchDashboardCancellation.promise },
        )) as Dashboard;
        result = {
          ...response,
          id: dashId,
          dashcards: response.dashcards.map((dc: DashboardCard) => ({
            ...dc,
            dashboard_id: dashId,
          })),
        };
      } else if (dashboardType === "transient") {
        const subPath = String(dashId).split("/").slice(3).join("/");
        const [entity, entityId] = subPath.split(/[/?]/);
        const [response] = (await Promise.all([
          AutoApi.dashboard(
            { subPath, dashboard_load_id: dashboardLoadId },
            { cancelled: fetchDashboardCancellation.promise },
          ),
          entityCompatibleQuery(
            {
              entity,
              entityId,
              dashboard_load_id: dashboardLoadId,
            },
            dispatch,
            automagicDashboardsApi.endpoints.getXrayDashboardQueryMetadata,
          ),
        ])) as [Dashboard, unknown];
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
          entityCompatibleQuery(
            { id: dashId, dashboard_load_id: dashboardLoadId },
            dispatch,
            dashboardApi.endpoints.getDashboardQueryMetadata,
            { forceRefetch: false },
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

      if (result.param_fields) {
        await dispatch(addFields(Object.values(result.param_fields).flat()));
      }

      const lastUsedParametersValues = result["last_used_param_values"] ?? {};

      const metadata = getMetadata(getState());
      const parameters = getSavedDashboardUiParameters(
        result.dashcards,
        result.parameters,
        result.param_fields,
        metadata,
      );
      const parameterValuesById = preserveParameters
        ? getParameterValues(getState())
        : getParameterValuesByIdFromQueryParams(
            parameters,
            queryParams,
            lastUsedParametersValues,
          );

      entities = entities ?? normalize(result, dashboardSchema).entities;

      return {
        entities,
        dashboard: result,
        dashboardId: result.id,
        parameterValues: parameterValuesById,
        preserveParameters,
      };
    } catch (error) {
      if (!(error as { isCancelled: boolean }).isCancelled) {
        console.error(error);
      }
      return rejectWithValue(error);
    }
  },
);
