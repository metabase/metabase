import { createAction } from "@reduxjs/toolkit";
import { getIn } from "icepick";
import { denormalize, normalize, schema } from "normalizr";
import { t } from "ttag";
import _ from "underscore";

import { automagicDashboardsApi, cardApi, dashboardApi } from "metabase/api";
import { applyParameters } from "metabase/common/utils/card";
import type { BatchRequestConfig } from "metabase/dashboard/actions/batch-card-query";
import { streamBatchCardQuery } from "metabase/dashboard/actions/batch-card-query";
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
} from "metabase/dashboard/utils";
import { entityCompatibleQuery } from "metabase/entities/utils";
import { getSavedDashboardUiParameters } from "metabase/parameters/utils/dashboards";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-parsing";
import { updateMetadata } from "metabase/redux/metadata";
import type { Dispatch, GetState } from "metabase/redux/store";
import { createAsyncThunk, createThunkAction } from "metabase/redux/utils";
import { FieldSchema } from "metabase/schema";
import { getMetadata } from "metabase/selectors/metadata";
import {
  AutoApi,
  DashboardApi,
  EmbedApi,
  PublicApi,
  getEmbedBase,
  maybeUsePivotEndpoint,
  runAdhocDatasetQuery,
  shouldUsePivotEndpoint,
} from "metabase/services";
import {
  getDashboardType,
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/utils/dashboard";
import type { Deferred } from "metabase/utils/promise";
import { defer } from "metabase/utils/promise";
import { uuid } from "metabase/utils/uuid";
import { isVisualizerDashboardCard } from "metabase/visualizer/utils";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { deriveFieldOperatorFromParameter } from "metabase-lib/v1/parameters/utils/operators";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Card,
  CardId,
  DashCardId,
  DashboardCard,
  DashboardId,
  Dataset,
  JsonQuery,
  Parameter,
  ParameterValuesMap,
  QuestionDashboardCard,
} from "metabase-types/api";

export const FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/FETCH_DASHBOARD_CARD_DATA";
export const fetchDashboardCardDataAction = createAction<{
  currentTime: number;
  loadingIds: DashCardId[];
}>(FETCH_DASHBOARD_CARD_DATA);

export const CANCEL_FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/CANCEL_FETCH_DASHBOARD_CARD_DATA";

export const RECEIVE_BATCH_CARD_RESULT =
  "metabase/dashboard/RECEIVE_BATCH_CARD_RESULT";
export const receiveBatchCardResult = createAction<{
  dashcard_id: DashCardId;
  card_id: CardId;
  result: Dataset;
}>(RECEIVE_BATCH_CARD_RESULT);

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

    // Safe to assert non-null here: the `!card.dataset_query` guard above
    // is the only case buildCardQuery returns null.
    const { datasetQuery, queryParams } = buildCardQuery(
      card,
      dashcard,
      dashboard.parameters,
      parameterValues,
      editingDashboard?.parameters,
    )!;

    const lastResult = getIn(dashcardData, [dashcard.id, card.id]);
    if (!reload) {
      // if reload not set, check to see if the last result has the same query dict and return that
      if (
        lastResult &&
        _.isEqual(getDatasetQueryParams(lastResult.json_query), queryParams)
      ) {
        return {
          dashcard_id: dashcard.id,
          card_id: card.id,
          result: lastResult,
        };
      }

      /**
       * If a request for this card is already in-flight with the same parameters, let it finish rather than cancelling
       * and restarting. This avoids re-executing slow queries (e.g. pivot tables) when switching dashboard tabs back
       * and forth (#70534). When parameters differ (e.g. filter change), we fall through to the cancel-and-restart
       * path below.
       */
      const inFlight = cardDataCancelDeferreds[`${dashcard.id},${card.id}`];
      if (inFlight && _.isEqual(inFlight.queryParams, queryParams)) {
        return;
      }
    }

    cancelFetchCardData(card.id, dashcard.id);

    // When dashcard parameters change, we need to clean previous (stale)
    // state so that the loader spinner shows as expected (#33767)
    const hasParametersChanged =
      !lastResult ||
      !_.isEqual(getDatasetQueryParams(lastResult.json_query), queryParams);

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
    setFetchCardDataCancel(card.id, dashcard.id, deferred, queryParams);

    let cancelled = false;
    deferred.promise.then(() => {
      cancelled = true;
    });

    const metadata = getMetadata(getState());
    const queryOptions = {
      cancelled: deferred.promise,
    };

    if (dashboardType === "public") {
      result = (await fetchDataOrError(
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
      )) as Dataset | { error: unknown };
    } else if (dashboardType === "embed") {
      result = (await fetchDataOrError(
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
      )) as Dataset | { error: unknown };
    } else if (dashboardType === "transient" || dashboardType === "inline") {
      result = (await fetchDataOrError(
        runAdhocDatasetQuery(
          dispatch,
          card,
          metadata,
          { ...datasetQuery, ignore_cache: ignoreCache },
          deferred,
        ),
      )) as Dataset | { error: unknown };
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
      if (shouldUseCardQueryEndpoint) {
        const cardQueryEndpoint = shouldUsePivotEndpoint(card, metadata)
          ? cardApi.endpoints.getCardQueryPivot
          : cardApi.endpoints.getCardQuery;
        const queryAction = dispatch(
          cardQueryEndpoint.initiate(
            { cardId: card.id, ignore_cache: ignoreCache },
            { forceRefetch: true },
          ),
        );
        deferred.promise.then(() => queryAction.abort());
        try {
          result = (await fetchDataOrError(queryAction.unwrap())) as
            | Dataset
            | { error: unknown };
        } finally {
          queryAction.unsubscribe?.();
        }
      } else {
        const requestBody = {
          dashboardId: dashcard.dashboard_id,
          dashcardId: dashcard.id,
          cardId: card.id,
          parameters: datasetQuery.parameters,
          ignore_cache: ignoreCache,
          dashboard_id: dashcard.dashboard_id,
          dashboard_load_id: dashboardLoadId,
        };
        result = (await fetchDataOrError(
          maybeUsePivotEndpoint(
            DashboardApi.cardQuery,
            card,
            metadata,
          )(requestBody, queryOptions),
        )) as Dataset | { error: unknown };
      }
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

// Leave 1 connection free for interactive requests (browser HTTP/1.1 limit is 6)
const HTTP1_CONCURRENT_CARD_FETCH_LIMIT = 5;

function getCardsFetchingConcurrencyLimit(): number {
  try {
    const [navigationEntry] = performance.getEntriesByType(
      "navigation",
    ) as PerformanceNavigationTiming[];
    const protocol = navigationEntry?.nextHopProtocol ?? "";
    // HTTP/2 and HTTP/3 multiplex requests over a single connection,
    // so the per-host connection limit does not apply
    if (protocol === "h2" || protocol === "h2c" || protocol.startsWith("h3")) {
      return Infinity;
    }
  } catch {
    // Performance API unavailable; fall through to the conservative limit
  }
  return HTTP1_CONCURRENT_CARD_FETCH_LIMIT;
}

const CONCURRENT_CARD_FETCH_LIMIT = getCardsFetchingConcurrencyLimit();

async function runWithConcurrencyLimit(
  tasks: (() => Promise<void>)[],
  limit: number,
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const taskIndex = index++;
      await tasks[taskIndex]();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
}

function getBatchRequestConfig(
  dashboardId: DashboardId,
  dashboardType: string,
  dashboardLoadId: string,
  parameters: { id: string; type: string; value: unknown }[],
  cards: { dashcard_id: DashCardId; card_id: CardId }[],
  parameterValues: ParameterValuesMap,
  dashboardParameters: { id: string; slug?: string }[] | undefined,
  ignoreCache: boolean,
  signal: AbortSignal,
): BatchRequestConfig | null {
  if (dashboardType === "normal") {
    return {
      url: `/api/dashboard/${dashboardId}/card-query-batch`,
      method: "POST",
      body: {
        dashboard_load_id: dashboardLoadId,
        parameters,
        ignore_cache: ignoreCache,
        cards,
      },
      signal,
    };
  }
  if (dashboardType === "public") {
    const qs = new URLSearchParams();
    if (parameters.length > 0) {
      qs.set("parameters", JSON.stringify(parameters));
    }
    if (cards.length > 0) {
      qs.set("cards", JSON.stringify(cards));
    }
    const query = qs.toString();
    return {
      url: `/api/public/dashboard/${dashboardId}/card-query-batch${query ? `?${query}` : ""}`,
      method: "GET",
      signal,
    };
  }
  if (dashboardType === "embed") {
    const qs = new URLSearchParams();
    // Match per-card embed behavior: pass slug values as JSON in a `parameters`
    // query param so arrays and types are preserved (parse-query-params decodes it)
    if (dashboardParameters) {
      const slugValues = getParameterValuesBySlug(
        dashboardParameters,
        parameterValues,
      );
      qs.set("parameters", JSON.stringify(slugValues));
    }
    if (cards.length > 0) {
      qs.set("cards", JSON.stringify(cards));
    }
    const query = qs.toString();
    // getEmbedBase() returns /api/preview_embed inside the embed-preview iframe
    // and /api/embed everywhere else; both routes expose card-query-batch.
    return {
      url: `${getEmbedBase()}/dashboard/${dashboardId}/card-query-batch${query ? `?${query}` : ""}`,
      method: "GET",
      signal,
    };
  }
  return null;
}

function canUseBatchEndpoint(
  dashboardType: string,
  isEditing: boolean,
): boolean {
  return (
    !isEditing &&
    (dashboardType === "normal" ||
      dashboardType === "public" ||
      dashboardType === "embed")
  );
}

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

    const dashboardType = getDashboardType(dashboard.id);
    const { editingDashboard, parameterValues } = getState().dashboard;
    const isEditing = editingDashboard != null;
    const useBatchEndpoint = canUseBatchEndpoint(dashboardType, isEditing);

    let nonVirtualDashcardsToFetch: typeof nonVirtualDashcards = [];
    if (isRefreshing) {
      nonVirtualDashcardsToFetch = nonVirtualDashcards.filter(
        ({ dashcard }) => {
          return !loadingIds.includes(dashcard.id);
        },
      );
    } else {
      nonVirtualDashcardsToFetch = nonVirtualDashcards;
    }

    // Pre-filter for the batch path: classify each card as cached (no fetch needed), already
    // in-flight with matching params (let the existing request finish), already in-flight with
    // different params (cancel and re-fetch), or fresh. Cached cards are dropped from loadingIds
    // entirely; the others are loaded. The per-card path does this dedup inside
    // fetchCardDataAction, so we skip it here when canUseBatchEndpoint is false.
    type BatchEntry = {
      card: Card;
      dashcard: (typeof nonVirtualDashcards)[number]["dashcard"];
      // `null` when the card was stripped of `dataset_query` by the backend —
      // the dashcard still goes in the batch so the backend can emit the 403.
      queryParams: ReturnType<typeof getDatasetQueryParams> | null;
    };
    const batchEntries: BatchEntry[] = useBatchEndpoint
      ? nonVirtualDashcardsToFetch.map(({ card, dashcard }) => ({
          card: card as Card,
          dashcard,
          queryParams:
            buildCardQuery(
              card as Card,
              dashcard,
              dashboard.parameters,
              parameterValues,
              editingDashboard?.parameters,
            )?.queryParams ?? null,
        }))
      : [];

    const batchCardsToFetch: BatchEntry[] = [];
    const batchCardsAlreadyInFlight: BatchEntry[] = [];
    if (useBatchEndpoint) {
      for (const entry of batchEntries) {
        const { card, dashcard, queryParams } = entry;
        if (reload) {
          batchCardsToFetch.push(entry);
          continue;
        }
        const key = `${dashcard.id},${card.id}` as const;
        const lastResult = getIn(getState().dashboard.dashcardData, [
          dashcard.id,
          card.id,
        ]);
        // Permission-stripped cards (backend deleted dataset_query because the
        // user can't read this card) mirror the per-card path's early-out at
        // fetchCardDataAction: once we have any cached result, don't re-fetch.
        // The first load still hits the server so it can emit the canonical
        // 403 card-error.
        if (!card.dataset_query) {
          if (lastResult) {
            continue;
          }
          batchCardsToFetch.push(entry);
          continue;
        }
        if (
          lastResult &&
          _.isEqual(getDatasetQueryParams(lastResult.json_query), queryParams)
        ) {
          continue;
        }
        const inFlight = cardDataCancelDeferreds[key];
        if (inFlight && _.isEqual(inFlight.queryParams, queryParams)) {
          batchCardsAlreadyInFlight.push(entry);
          continue;
        }
        if (inFlight) {
          // Clear the stale entry inline rather than dispatching cancelFetchCardData — the latter
          // aborts the whole batch (which would discard in-flight work for cards whose params
          // didn't change). The old batch's onCardResult for this card will be dropped by the
          // deferred-identity check in dispatchBatchCardResult.
          inFlight.deferred.resolve();
          cardDataCancelDeferreds[key] = null;
        }
        if (lastResult) {
          dispatch(clearCardData(card.id, dashcard.id));
        }
        batchCardsToFetch.push(entry);
      }
    }

    const newLoadingIds = useBatchEndpoint
      ? [...batchCardsToFetch, ...batchCardsAlreadyInFlight].map(
          ({ dashcard }) => dashcard.id,
        )
      : nonVirtualDashcardsToFetch.map(({ dashcard }) => dashcard.id);

    /**
     * We intentionally do NOT cancel in-flight requests here. Both paths handle their own
     * deduplication: the per-card path (fetchCardDataAction) returns early when an identical
     * request is already in-flight and cancels stale requests when parameters change. The batch
     * path pre-filters its candidate set against the same in-flight map above. Cancelling here
     * would abort nearly-complete requests on tab switch, forcing slow queries (e.g. pivots) to
     * restart from scratch. (#70534)
     */
    dispatch(
      fetchDashboardCardDataAction({
        currentTime: performance.now(),
        loadingIds: isRefreshing
          ? loadingIds.concat(newLoadingIds)
          : newLoadingIds,
      }),
    );

    if (nonVirtualDashcardsToFetch.length === 0) {
      return;
    }

    if (useBatchEndpoint && batchCardsToFetch.length === 0) {
      // Nothing new to fetch. Any matched-in-flight requests will resolve themselves.
      if (batchCardsAlreadyInFlight.length === 0) {
        dispatch(loadingComplete());
      }
      return;
    }

    if (useBatchEndpoint) {
      // Send every dashboard parameter, including ones with a null value, so
      // the server can clear its stored last-used value on filter reset.
      // `options` carries operator defaults like `case-sensitive: false` for
      // `string/contains`; without it the backend runs a case-sensitive
      // filter.
      const batchParameters = (dashboard.parameters ?? []).map((p) => {
        const options = deriveFieldOperatorFromParameter(p)?.optionsDefaults;
        return {
          id: p.id,
          type: p.type,
          value: parameterValues[p.id] ?? null,
          ...(options ? { options } : {}),
        };
      });

      const cards = batchCardsToFetch.map(({ card, dashcard }) => ({
        dashcard_id: dashcard.id,
        card_id: card.id,
      }));

      const abortController = new AbortController();
      batchFetchAbortControllers.push(abortController);
      while (batchFetchAbortControllers.length > MAX_OVERLAPPING_BATCHES) {
        const oldest = batchFetchAbortControllers.shift();
        oldest?.abort();
      }

      const removeAbortController = () => {
        const idx = batchFetchAbortControllers.indexOf(abortController);
        if (idx !== -1) {
          batchFetchAbortControllers.splice(idx, 1);
        }
      };

      let completedCount = 0;
      const totalCount = batchCardsToFetch.length;
      dispatch(setDocumentTitle(t`0/${totalCount} loaded`));

      // Register a deferred per card so subsequent fetchDashboardCardData calls observe these as
      // in-flight. The deferreds aren't used as cancellation tokens (the shared abortController
      // does that) — they're only in-flight markers in cardDataCancelDeferreds. We track them in
      // batchDeferreds so callbacks can detect when a newer batch has taken over a key.
      const batchDeferreds = new Map<string, Deferred>();
      for (const { card, dashcard, queryParams } of batchCardsToFetch) {
        const deferred = defer();
        batchDeferreds.set(`${dashcard.id},${card.id}`, deferred);
        setFetchCardDataCancel(
          card.id,
          dashcard.id,
          deferred,
          queryParams ?? undefined,
        );
      }

      const clearBatchDeferreds = () => {
        for (const [key, deferred] of batchDeferreds) {
          const typedKey = key as `${DashCardId},${DashboardCard["card_id"]}`;
          if (cardDataCancelDeferreds[typedKey]?.deferred === deferred) {
            cardDataCancelDeferreds[typedKey] = null;
          }
        }
        batchDeferreds.clear();
      };

      const requestConfig = getBatchRequestConfig(
        dashboard.id,
        dashboardType,
        dashboardLoadId,
        batchParameters,
        cards,
        parameterValues,
        dashboard.parameters ?? undefined,
        reload,
        abortController.signal,
      );

      if (!requestConfig) {
        // Shouldn't happen given canUseBatchEndpoint check, but satisfy TS
        clearBatchDeferreds();
        removeAbortController();
        return;
      }

      const dispatchBatchCardResult = (
        dashcardId: DashCardId,
        cardId: CardId,
        result: Dataset,
      ) => {
        const key = `${dashcardId},${cardId}` as const;
        const current = cardDataCancelDeferreds[key];
        if (!current || current.deferred !== batchDeferreds.get(key)) {
          // A newer batch (or explicit cancellation) has replaced this entry — drop the stale
          // result instead of overwriting fresh state.
          return;
        }
        cardDataCancelDeferreds[key] = null;
        batchDeferreds.delete(key);
        dispatch(
          receiveBatchCardResult({
            dashcard_id: dashcardId,
            card_id: cardId,
            result,
          }),
        );
        completedCount++;
        dispatch(setDocumentTitle(t`${completedCount}/${totalCount} loaded`));
      };

      return streamBatchCardQuery(requestConfig, {
        onCardResult: dispatchBatchCardResult,
        onCardError: (dashcardId, cardId, dataset) =>
          dispatchBatchCardResult(dashcardId, cardId, dataset as Dataset),
        onComplete: () => {
          clearBatchDeferreds();
          removeAbortController();
          dispatch(loadingComplete());
        },
      }).catch((err) => {
        if (err?.name === "AbortError") {
          clearBatchDeferreds();
          removeAbortController();
          dispatch(loadingComplete());
          return;
        }
        console.error("Batch card query failed:", err);
        // Entire batch failed before any card-begin (e.g. locked parameter
        // without JWT value). Mark every card we asked for as errored so the
        // dashcard renders an error state instead of an infinite spinner.
        const message =
          err instanceof Error ? err.message : t`Batch card query failed`;
        const errorDataset = {
          status: "failed",
          error: message,
          data: { cols: [], rows: [] },
        } as unknown as Dataset;
        for (const { card, dashcard } of batchCardsToFetch) {
          dispatchBatchCardResult(dashcard.id, card.id, errorDataset);
        }
        clearBatchDeferreds();
        removeAbortController();
        dispatch(loadingComplete());
      });
    }

    // Fallback: per-card fetching for transient/inline dashboards or editing mode
    dispatch(
      setDocumentTitle(t`0/${nonVirtualDashcardsToFetch.length} loaded`),
    );
    const tasks = nonVirtualDashcardsToFetch.map(
      ({ card, dashcard }) =>
        async () => {
          await dispatch(
            fetchCardData(card as Card, dashcard, {
              reload,
              clearCache,
              dashboardLoadId,
            }),
          );
          await dispatch(updateLoadingTitle(nonVirtualDashcardsToFetch.length));
        },
    );

    // TODO: There is a race condition here, when refreshing a dashboard before
    // the previous API calls finished.
    return runWithConcurrencyLimit(tasks, CONCURRENT_CARD_FETCH_LIMIT).then(
      () => {
        dispatch(loadingComplete());
      },
    );
  };

export const reloadDashboardCards =
  () => async (dispatch: Dispatch, getState: GetState) => {
    const dashboard = getDashboardComplete(getState());

    if (!dashboard) {
      return;
    }

    const reloadTasks = getAllDashboardCards(dashboard)
      .filter(({ dashcard }) => !isVirtualDashCard(dashcard))
      .map(({ card, dashcard }) => async () => {
        await dispatch(
          // TODO: fix the return type of getAllDashboardCards to make sure
          // that the relationship between a dashcard and its card
          // is actually reflected in the type system
          fetchCardData(card as Card, dashcard, {
            reload: true,
            ignoreCache: true,
          }),
        );
      });

    await runWithConcurrencyLimit(reloadTasks, CONCURRENT_CARD_FETCH_LIMIT);
  };

export const cancelFetchDashboardCardData = createThunkAction(
  CANCEL_FETCH_DASHBOARD_CARD_DATA,
  () => (dispatch, getState) => {
    abortBatchCardQuery();

    const dashboard = getDashboardComplete(getState());

    if (!dashboard) {
      return;
    }

    for (const { card, dashcard } of getAllDashboardCards(dashboard)) {
      dispatch(cancelFetchCardData(card.id, dashcard.id));
    }
  },
);

type InFlightEntry = {
  deferred: Deferred;
  queryParams: ReturnType<typeof getDatasetQueryParams>;
};

// Bounded queue of live batch AbortControllers. When a new batch starts and the
// queue is at capacity, the oldest controller is aborted before the new one is
// pushed. This preserves the #70534 single-overlap intent (the first overlap
// stays alive so slow in-flight work isn't restarted) while preventing
// unbounded overlap under rapid retriggers (e.g. slider drag).
const MAX_OVERLAPPING_BATCHES = 2;
const batchFetchAbortControllers: AbortController[] = [];

const cardDataCancelDeferreds: Record<
  `${DashCardId},${DashboardCard["card_id"]}`,
  InFlightEntry | null
> = {};

function setFetchCardDataCancel(
  card_id: DashboardCard["card_id"],
  dashcard_id: DashCardId,
  deferred: Deferred | null,
  queryParams?: ReturnType<typeof getDatasetQueryParams>,
) {
  cardDataCancelDeferreds[`${dashcard_id},${card_id}`] = deferred
    ? { deferred, queryParams: queryParams! }
    : null;
}

// machinery to support query cancellation
export const cancelFetchCardData = createAction(
  CANCEL_FETCH_CARD_DATA,
  (card_id, dashcard_id) => {
    const entry = cardDataCancelDeferreds[`${dashcard_id},${card_id}`];
    if (entry) {
      entry.deferred.resolve();
      cardDataCancelDeferreds[`${dashcard_id},${card_id}`] = null;
    }
    return { payload: { dashcard_id, card_id } };
  },
);

/**
 * Abort the in-flight batch card-query request, if any. Per-card cancellation
 * isn't possible on the batch endpoint — one fetch carries every loading card.
 * Callers that need to stop a mid-stream batch (e.g. dashcard removal) invoke
 * this directly.
 */
export function abortBatchCardQuery() {
  while (batchFetchAbortControllers.length > 0) {
    const controller = batchFetchAbortControllers.shift();
    controller?.abort();
  }
}

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

// Builds a card's resolved datasetQuery from dashboard parameter state, plus its normalized
// queryParams used as the cache/in-flight key. Both the per-card and the batch path call this so
// the dedup keys stay identical across paths.
function buildCardQuery(
  card: Card,
  dashcard: DashboardCard,
  dashboardParameters: Parameter[] | null | undefined,
  parameterValues: ParameterValuesMap,
  editingDashboardParameters: Parameter[] | null | undefined,
) {
  // The backend strips `dataset_query` from cards the current user can't read.
  // Return null so the batch dispatch can still include the dashcard — the
  // backend's per-card runner emits a real 403 card-error which the FE then
  // surfaces as the standard permission-error tile.
  if (!card.dataset_query) {
    return null;
  }
  const savedParameterIds = new Set(
    editingDashboardParameters?.map((p) => p.id),
  );
  const savedParameters =
    editingDashboardParameters != null
      ? dashboardParameters?.filter((p) => savedParameterIds.has(p.id))
      : dashboardParameters;
  const datasetQuery = applyParameters(
    card,
    savedParameters,
    parameterValues,
    dashcard?.parameter_mappings ?? undefined,
  );
  return { datasetQuery, queryParams: getDatasetQueryParams(datasetQuery) };
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
          entityCompatibleQuery(
            {
              entity,
              entityId,
              dashboard_load_id: dashboardLoadId,
            },
            dispatch,
            automagicDashboardsApi.endpoints.getXrayDashboardQueryMetadata,
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
        await dispatch(
          updateMetadata(Object.values(result.param_fields).flat(), [
            FieldSchema,
          ]),
        );
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
