import { getIn } from "icepick";
import { t } from "ttag";

import { showAutoApplyFiltersToast } from "metabase/dashboard/actions/parameters";
import { defer } from "metabase/lib/promise";
import { createAction, createThunkAction } from "metabase/lib/redux";
import { equals } from "metabase/lib/utils";
import { uuid } from "metabase/lib/uuid";
import {
  DashboardApi,
  CardApi,
  PublicApi,
  EmbedApi,
  MetabaseApi,
  maybeUsePivotEndpoint,
} from "metabase/services";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import { applyParameters } from "metabase-lib/v1/queries/utils/card";

import { DASHBOARD_SLOW_TIMEOUT } from "../constants";
import {
  getDashboardComplete,
  getDashCardBeforeEditing,
  getLoadingDashCards,
  getCanShowAutoApplyFiltersToast,
  getDashCardById,
  getSelectedTabId,
} from "../selectors";
import {
  isVirtualDashCard,
  getAllDashboardCards,
  getDashboardType,
  fetchDataOrError,
  getCurrentTabDashboardCards,
} from "../utils";

export const FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/FETCH_DASHBOARD_CARD_DATA";
export const CANCEL_FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/CANCEL_FETCH_DASHBOARD_CARD_DATA";

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

export const fetchCardData = createThunkAction(
  FETCH_CARD_DATA,
  function (
    card,
    dashcard,
    { reload, clearCache, ignoreCache, dashboardLoadId } = {},
  ) {
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
          isNewAdditionalSeriesCard(card, dashcard) ||
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
    };
  },
);

export const fetchDashboardCardData =
  ({
    isRefreshing = false,
    reload = false,
    clearCache = false,
    loadAllCards = false,
  } = {}) =>
  (dispatch, getState) => {
    const dashboard = getDashboardComplete(getState());
    const selectedTabId = getSelectedTabId(getState());
    const dashboardLoadId = uuid();

    const loadingIds = getLoadingDashCards(getState()).loadingIds;
    const nonVirtualDashcards = getCurrentTabDashboardCards(
      dashboard,
      selectedTabId,
      loadAllCards,
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
      return dispatch(
        fetchCardData(card, dashcard, { reload, clearCache, dashboardLoadId }),
      ).then(() => {
        return dispatch(updateLoadingTitle(nonVirtualDashcardsToFetch.length));
      });
    });

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

function getDatasetQueryParams(datasetQuery = {}) {
  const { type, query, native, parameters = [] } = datasetQuery;
  return {
    type,
    query,
    native,
    parameters: parameters
      .map(parameter => ({
        ...parameter,
        value: parameter.value ?? null,
      }))
      .sort(sortById),
  };
}

function sortById(a, b) {
  return a.id.localeCompare(b.id);
}
