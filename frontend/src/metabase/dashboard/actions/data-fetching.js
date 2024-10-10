import { t } from "ttag";

import { showAutoApplyFiltersToast } from "metabase/dashboard/actions/parameters";
import { createThunkAction } from "metabase/lib/redux";
import { uuid } from "metabase/lib/uuid";

import {
  getCanShowAutoApplyFiltersToast,
  getDashCardById,
  getDashboardComplete,
  getLoadingDashCards,
  getSelectedTabId,
} from "../selectors";
import {
  getAllDashboardCards,
  getCurrentTabDashboardCards,
  isVirtualDashCard,
} from "../utils";

import {
  SET_DOCUMENT_TITLE,
  cancelFetchCardData,
  fetchCardData,
  fetchDashboardCardDataAction,
  setDocumentTitle,
  setShowLoadingCompleteFavicon,
} from "./data-fetching-typed";

export const CANCEL_FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/CANCEL_FETCH_DASHBOARD_CARD_DATA";

export const SET_LOADING_DASHCARDS_COMPLETE =
  "metabase/dashboard/SET_LOADING_DASHCARDS_COMPLETE";

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

export const fetchDashboardCardData =
  ({ isRefreshing = false, reload = false, clearCache = false } = {}) =>
  (dispatch, getState) => {
    const dashboard = getDashboardComplete(getState());
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

      dispatch(fetchDashboardCardDataAction, {
        currentTime: performance.now(),
        loadingIds: newLoadingIds,
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
