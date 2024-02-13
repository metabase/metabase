import { getIn } from "icepick";

import { t } from "ttag";

import { denormalize, normalize, schema } from "normalizr";
import {
  createAction,
  createAsyncThunk,
  createThunkAction,
} from "metabase/lib/redux";
import { defer } from "metabase/lib/promise";

import { getDashboardUiParameters } from "metabase/parameters/utils/dashboards";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-values";

import { equals } from "metabase/lib/utils";

import { addParamValues, addFields } from "metabase/redux/metadata";

import {
  DashboardApi,
  CardApi,
  PublicApi,
  EmbedApi,
  AutoApi,
  MetabaseApi,
  maybeUsePivotEndpoint,
} from "metabase/services";

import { getMetadata } from "metabase/selectors/metadata";
import { showAutoApplyFiltersToast } from "metabase/dashboard/actions/parameters";
import { getParameterValuesBySlug } from "metabase-lib/parameters/utils/parameter-values";
import { applyParameters } from "metabase-lib/queries/utils/card";
import {
  getDashboardComplete,
  getParameterValues,
  getLoadingDashCards,
  getCanShowAutoApplyFiltersToast,
  getDashboardById,
  getDashCardById,
  getSelectedTabId,
} from "../selectors";

import {
  expandInlineDashboard,
  isVirtualDashCard,
  getAllDashboardCards,
  getDashboardType,
  fetchDataOrError,
  getDatasetQueryParams,
  getCurrentTabDashboardCards,
} from "../utils";
import { DASHBOARD_SLOW_TIMEOUT } from "../constants";
import { loadMetadataForDashboard } from "./metadata";

// normalizr schemas
const dashcard = new schema.Entity("dashcard");
const dashboard = new schema.Entity("dashboard", {
  dashcards: [dashcard],
});

export const FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/FETCH_DASHBOARD_CARD_DATA";
export const CANCEL_FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/CANCEL_FETCH_DASHBOARD_CARD_DATA";

export const FETCH_DASHBOARD_CARD_METADATA =
  "metabase/dashboard/FETCH_DASHBOARD_CARD_METADATA";

export const FETCH_CARD_DATA = "metabase/dashboard/FETCH_CARD_DATA";
export const FETCH_CARD_DATA_PENDING =
  "metabase/dashboard/FETCH_CARD_DATA/pending";

export const CANCEL_FETCH_CARD_DATA =
  "metabase/dashboard/CANCEL_FETCH_CARD_DATA";

export const MARK_CARD_AS_SLOW = "metabase/dashboard/MARK_CARD_AS_SLOW";
export const CLEAR_CARD_DATA = "metabase/dashboard/CLEAR_CARD_DATA";

export const SET_SHOW_LOADING_COMPLETE_FAVICON =
  "metabase/dashboard/SET_SHOW_LOADING_COMPLETE_FAVICON";

export const SET_LOADING_DASHCARDS_COMPLETE =
  "metabase/dashboard/SET_LOADING_DASHCARDS_COMPLETE";

export const SET_DOCUMENT_TITLE = "metabase/dashboard/SET_DOCUMENT_TITLE";
const setDocumentTitle = createAction(SET_DOCUMENT_TITLE);

export const setShowLoadingCompleteFavicon = createAction(
  SET_SHOW_LOADING_COMPLETE_FAVICON,
);

// real dashcard ids are integers >= 1
function isNewDashcard(dashcard) {
  return dashcard.id < 0;
}

function isNewAdditionalSeriesCard(card, dashcard) {
  return (
    card.id !== dashcard.card_id && !dashcard.series.some(s => s.id === card.id)
  );
}

const updateLoadingTitle = createThunkAction(
  SET_DOCUMENT_TITLE,
  totalCards => (_dispatch, getState) => {
    const loadingDashCards = getLoadingDashCards(getState());
    const loadingComplete = totalCards - loadingDashCards.loadingIds.length;
    return `${loadingComplete}/${totalCards} loaded`;
  },
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

let fetchDashboardCancellation;

export const fetchDashboard = createAsyncThunk(
  "metabase/dashboard/FETCH_DASHBOARD",
  async (
    {
      dashId,
      queryParams,
      options: { preserveParameters = false, clearCache = true } = {},
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
          { uuid: dashId },
          { cancelled: fetchDashboardCancellation.promise },
        );
        result = {
          ...result,
          id: dashId,
          dashcards: result.dashcards.map(dc => ({
            ...dc,
            dashboard_id: dashId,
          })),
        };
      } else if (dashboardType === "embed") {
        result = await EmbedApi.dashboard(
          { token: dashId },
          { cancelled: fetchDashboardCancellation.promise },
        );
        result = {
          ...result,
          id: dashId,
          dashcards: result.dashcards.map(dc => ({
            ...dc,
            dashboard_id: dashId,
          })),
        };
      } else if (dashboardType === "transient") {
        const subPath = dashId.split("/").slice(3).join("/");
        result = await AutoApi.dashboard(
          { subPath },
          { cancelled: fetchDashboardCancellation.promise },
        );
        result = {
          ...result,
          id: dashId,
          dashcards: result.dashcards.map(dc => ({
            ...dc,
            dashboard_id: dashId,
          })),
        };
      } else if (dashboardType === "inline") {
        // HACK: this is horrible but the easiest way to get "inline" dashboards up and running
        // pass the dashboard in as dashboardId, and replace the id with [object Object] because
        // that's what it will be when cast to a string
        result = expandInlineDashboard(dashId);
        dashId = result.id = String(dashId);
      } else {
        result = await DashboardApi.get(
          { dashId: dashId },
          { cancelled: fetchDashboardCancellation.promise },
        );
      }

      fetchDashboardCancellation = null;

      if (dashboardType === "normal" || dashboardType === "transient") {
        const selectedTabId = getSelectedTabId(getState());

        const cards =
          selectedTabId === undefined
            ? result.dashcards
            : result.dashcards.filter(
                c => c.dashboard_tab_id === selectedTabId,
              );

        await dispatch(loadMetadataForDashboard(cards));
      }

      const isUsingCachedResults = entities != null;
      if (!isUsingCachedResults) {
        // copy over any virtual cards from the dashcard to the underlying card/question
        result.dashcards.forEach(card => {
          if (card.visualization_settings.virtual_card) {
            card.card = Object.assign(
              card.card || {},
              card.visualization_settings.virtual_card,
            );
          }
        });
      }

      if (result.param_values) {
        dispatch(addParamValues(result.param_values));
      }
      if (result.param_fields) {
        dispatch(addFields(result.param_fields));
      }

      const metadata = getMetadata(getState());
      const parameters = getDashboardUiParameters(result, metadata);

      const parameterValuesById = preserveParameters
        ? getParameterValues(getState())
        : getParameterValuesByIdFromQueryParams(parameters, queryParams);

      entities = entities ?? normalize(result, dashboard).entities;

      return {
        entities,
        dashboard: result,
        dashboardId: dashId,
        parameterValues: parameterValuesById,
        preserveParameters,
      };
    } catch (error) {
      if (!error.isCancelled) {
        console.error(error);
      }
      return rejectWithValue(error);
    }
  },
);

export const fetchCardData = createThunkAction(
  FETCH_CARD_DATA,
  function (card, dashcard, { reload, clearCache, ignoreCache } = {}) {
    return async function (dispatch, getState) {
      dispatch({
        type: FETCH_CARD_DATA_PENDING,
        payload: {
          dashcard_id: dashcard.id,
          card_id: card.id,
        },
      });

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
      const dashboard = dashboards[dashboardId];

      // if we have a parameter, apply it to the card query before we execute
      const datasetQuery = applyParameters(
        card,
        dashboard.parameters,
        parameterValues,
        dashcard && dashcard.parameter_mappings,
      );

      if (!reload) {
        // if reload not set, check to see if the last result has the same query dict and return that
        const lastResult = getIn(dashcardData, [dashcard.id, card.id]);
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

      if (clearCache) {
        // clears the card data to indicate the card is reloading
        dispatch(clearCardData(card.id, dashcard.id));
      }

      let result = null;

      // start a timer that will show the expected card duration if the query takes too long
      const slowCardTimer = setTimeout(() => {
        if (result === null) {
          dispatch(markCardAsSlow(card, datasetQuery));
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
              ...getParameterValuesBySlug(
                dashboard.parameters,
                parameterValues,
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
        // new dashcards and new additional series cards aren't yet saved to the dashboard, so they need to be run using the card query endpoint
        const endpoint =
          isNewDashcard(dashcard) || isNewAdditionalSeriesCard(card, dashcard)
            ? CardApi.query
            : DashboardApi.cardQuery;

        result = await fetchDataOrError(
          maybeUsePivotEndpoint(endpoint, card)(
            {
              dashboardId: dashcard.dashboard_id,
              dashcardId: dashcard.id,
              cardId: card.id,
              parameters: datasetQuery.parameters,
              ignore_cache: ignoreCache,
              dashboard_id: dashcard.dashboard_id,
            },
            queryOptions,
          ),
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
    };
  },
);

export const fetchDashboardCardData =
  ({ isRefreshing, ...options } = {}) =>
  (dispatch, getState) => {
    const dashboard = getDashboardComplete(getState());
    const selectedTabId = getSelectedTabId(getState());

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

      dispatch({
        type: FETCH_DASHBOARD_CARD_DATA,
        payload: {
          currentTime: performance.now(),
          loadingIds: loadingIds.concat(newLoadingIds),
        },
      });
    } else {
      nonVirtualDashcardsToFetch = nonVirtualDashcards;
      const newLoadingIds = nonVirtualDashcardsToFetch.map(({ dashcard }) => {
        return dashcard.id;
      });

      for (const id of loadingIds) {
        const dashcard = getDashCardById(getState(), id);
        dispatch(cancelFetchCardData(dashcard.card.id, dashcard.id));
      }

      dispatch({
        type: FETCH_DASHBOARD_CARD_DATA,
        payload: {
          currentTime: performance.now(),
          loadingIds: newLoadingIds,
        },
      });
    }

    const promises = nonVirtualDashcardsToFetch.map(({ card, dashcard }) => {
      return dispatch(fetchCardData(card, dashcard, options)).then(() => {
        return dispatch(updateLoadingTitle(nonVirtualDashcardsToFetch.length));
      });
    });

    if (nonVirtualDashcardsToFetch.length > 0) {
      dispatch(
        setDocumentTitle(t`0/${nonVirtualDashcardsToFetch.length} loaded`),
      );

      // TODO: There is a race condition here, when refreshing a dashboard before
      // the previous API calls finished.
      Promise.all(promises).then(() => {
        dispatch(loadingComplete());
      });
    }
  };

export const fetchDashboardCardMetadata = createThunkAction(
  FETCH_DASHBOARD_CARD_METADATA,
  () => async (dispatch, getState) => {
    const allDashCards = getDashboardComplete(getState()).dashcards;
    const selectedTabId = getSelectedTabId(getState());

    const cards = allDashCards.filter(
      dc =>
        selectedTabId !== undefined && dc.dashboard_tab_id === selectedTabId,
    );
    await dispatch(loadMetadataForDashboard(cards));
  },
);

export const reloadDashboardCards = () => async (dispatch, getState) => {
  const dashboard = getDashboardComplete(getState());

  const reloads = getAllDashboardCards(dashboard)
    .filter(({ dashcard }) => !isVirtualDashCard(dashcard))
    .map(({ card, dashcard }) =>
      dispatch(
        fetchCardData(card, dashcard, { reload: true, ignoreCache: true }),
      ),
    );

  await Promise.all(reloads);
};

export const cancelFetchDashboardCardData = createThunkAction(
  CANCEL_FETCH_DASHBOARD_CARD_DATA,
  () => (dispatch, getState) => {
    const dashboard = getDashboardComplete(getState());
    for (const { card, dashcard } of getAllDashboardCards(dashboard)) {
      dispatch(cancelFetchCardData(card.id, dashcard.id));
    }
  },
);

const cardDataCancelDeferreds = {};

function setFetchCardDataCancel(card_id, dashcard_id, deferred) {
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
    return { dashcard_id, card_id };
  },
);

export const clearCardData = createAction(
  CLEAR_CARD_DATA,
  (cardId, dashcardId) => ({ cardId, dashcardId }),
);

export const markCardAsSlow = createAction(MARK_CARD_AS_SLOW, card => ({
  id: card.id,
  result: true,
}));
