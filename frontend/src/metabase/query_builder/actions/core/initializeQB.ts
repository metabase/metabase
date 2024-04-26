import type { LocationDescriptorObject } from "history";
import querystring from "querystring";

import { fetchAlertsForQuestion } from "metabase/alert/alert";
import Questions from "metabase/entities/questions";
import Snippets from "metabase/entities/snippets";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { deserializeCardFromUrl, loadCard } from "metabase/lib/card";
import { isNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import {
  getIsEditingInDashboard,
  getIsNotebookNativePreviewShown,
  getNotebookNativePreviewSidebarWidth,
} from "metabase/query_builder/selectors";
import { loadMetadataForCard } from "metabase/questions/actions";
import { setErrorPage } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import { getUser } from "metabase/selectors/user";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { updateCardTemplateTagNames } from "metabase-lib/v1/queries/NativeQuery";
import { cardIsEquivalent } from "metabase-lib/v1/queries/utils/card";
import { normalize } from "metabase-lib/v1/queries/utils/normalize";
import type { Card, MetricId, SegmentId } from "metabase-types/api";
import { isSavedCard } from "metabase-types/guards";
import type {
  Dispatch,
  GetState,
  QueryBuilderUIControls,
} from "metabase-types/store";

import { getQueryBuilderModeFromLocation } from "../../typed-utils";
import { updateUrl } from "../navigation";
import { cancelQuery, runQuestionQuery } from "../querying";

import { resetQB } from "./core";
import {
  getParameterValuesForQuestion,
  propagateDashboardParameters,
} from "./parameterUtils";

type BlankQueryOptions = {
  db?: string;
  table?: string;
  segment?: string;
  metric?: string;
};

type QueryParams = BlankQueryOptions & {
  slug?: string;
  objectId?: string;
};

type UIControls = Partial<QueryBuilderUIControls>;

const ARCHIVED_ERROR = {
  data: {
    error_code: "archived",
  },
  context: "query-builder",
};

const NOT_FOUND_ERROR = {
  data: {
    error_code: "not-found",
  },
  context: "query-builder",
};

function getCardForBlankQuestion(
  metadata: Metadata,
  options: BlankQueryOptions,
) {
  const databaseId = options.db ? parseInt(options.db) : undefined;
  const tableId = options.table ? parseInt(options.table) : undefined;
  const segmentId = options.segment ? parseInt(options.segment) : undefined;
  const metricId = options.metric ? parseInt(options.metric) : undefined;

  let question = Question.create({ databaseId, tableId, metadata });

  if (databaseId && tableId) {
    if (typeof segmentId === "number") {
      question = filterBySegmentId(question, segmentId);
    }

    if (typeof metricId === "number") {
      question = aggregateByMetricId(question, metricId);
    }
  }

  return question.card();
}

function filterBySegmentId(question: Question, segmentId: SegmentId) {
  const stageIndex = -1;
  const query = question.query();
  const segmentMetadata = Lib.segmentMetadata(query, segmentId);

  if (!segmentMetadata) {
    return question;
  }

  const newQuery = Lib.filter(query, stageIndex, segmentMetadata);
  return question.setQuery(newQuery);
}

function aggregateByMetricId(question: Question, metricId: MetricId) {
  const stageIndex = -1;
  const query = question.query();
  const metricMetadata = Lib.legacyMetricMetadata(query, metricId);

  if (!metricMetadata) {
    return question;
  }

  const newQuery = Lib.aggregate(query, stageIndex, metricMetadata);
  return question.setQuery(newQuery);
}

function deserializeCard(serializedCard: string) {
  const card = deserializeCardFromUrl(serializedCard);
  if (card.dataset_query.database != null) {
    // Ensure older MBQL is supported
    card.dataset_query = normalize(card.dataset_query);
  }
  return card;
}

async function fetchAndPrepareSavedQuestionCards(
  cardId: number,
  dispatch: Dispatch,
  getState: GetState,
) {
  const card = await loadCard(cardId, { dispatch, getState });
  const originalCard = { ...card };

  // for showing the "started from" lineage correctly when adding filters/breakouts and when going back and forth
  // in browser history, the original_card_id has to be set for the current card (simply the id of card itself for now)
  return { card: { ...card, original_card_id: card.id }, originalCard };
}

async function fetchAndPrepareAdHocQuestionCards(
  deserializedCard: Card,
  dispatch: Dispatch,
  getState: GetState,
) {
  if (!deserializedCard.original_card_id) {
    return {
      card: deserializedCard,
      originalCard: null,
    };
  }

  const originalCard = await loadCard(deserializedCard.original_card_id, {
    dispatch,
    getState,
  });

  if (cardIsEquivalent(deserializedCard, originalCard)) {
    return {
      card: { ...originalCard },
      originalCard: originalCard,
    };
  }

  return {
    card: deserializedCard,
    originalCard,
  };
}

type ResolveCardsResult = {
  card: Card;
  originalCard?: Card;
};

async function resolveCards({
  cardId,
  deserializedCard,
  options,
  dispatch,
  getState,
}: {
  cardId?: number;
  deserializedCard?: Card;
  options: BlankQueryOptions;
  dispatch: Dispatch;
  getState: GetState;
}): Promise<ResolveCardsResult> {
  if (!cardId && !deserializedCard) {
    const metadata = getMetadata(getState());

    return {
      card: getCardForBlankQuestion(metadata, options),
    };
  }
  return cardId
    ? fetchAndPrepareSavedQuestionCards(cardId, dispatch, getState)
    : fetchAndPrepareAdHocQuestionCards(
        deserializedCard as Card,
        dispatch,
        getState,
      );
}

function parseHash(hash?: string) {
  let options: BlankQueryOptions = {};
  let serializedCard;

  // hash can contain either query params starting with ? or a base64 serialized card
  if (hash) {
    const cleanHash = hash.replace(/^#/, "");
    if (cleanHash.charAt(0) === "?") {
      options = querystring.parse(cleanHash.substring(1));
    } else {
      serializedCard = cleanHash;
    }
  }

  return { options, serializedCard };
}

export const INITIALIZE_QB = "metabase/qb/INITIALIZE_QB";

/**
 * Updates the template tag names in the query
 * to match the latest on the backend, because
 * they might have changed since the query was last opened.
 */
export async function updateTemplateTagNames(
  query: NativeQuery,
  getState: GetState,
  dispatch: Dispatch,
): Promise<NativeQuery> {
  const referencedCards = (
    await Promise.all(
      query.referencedQuestionIds().map(async id => {
        try {
          const actionResult = await dispatch(
            Questions.actions.fetch({ id }, { noEvent: true }),
          );
          return Questions.HACK_getObjectFromAction(actionResult);
        } catch {
          return null;
        }
      }),
    )
  ).filter(isNotNull);

  query = updateCardTemplateTagNames(query, referencedCards);
  if (query.hasSnippets()) {
    await dispatch(Snippets.actions.fetchList());
    const snippets = Snippets.selectors.getList(getState());
    query = query.updateSnippetNames(snippets);
  }
  return query;
}

async function handleQBInit(
  dispatch: Dispatch,
  getState: GetState,
  {
    location,
    params,
  }: { location: LocationDescriptorObject; params: QueryParams },
) {
  dispatch(resetQB());
  dispatch(cancelQuery());

  const queryParams = location.query;
  const cardId = Urls.extractEntityId(params.slug);
  const uiControls: UIControls = getQueryBuilderModeFromLocation(location);
  const { options, serializedCard } = parseHash(location.hash);
  const hasCard = cardId || serializedCard;

  const deserializedCard = serializedCard
    ? deserializeCard(serializedCard)
    : null;

  let { card, originalCard } = await resolveCards({
    cardId,
    deserializedCard,
    options,
    dispatch,
    getState,
  });

  if (isSavedCard(card) && card.archived) {
    dispatch(setErrorPage(ARCHIVED_ERROR));
    return;
  }

  if (
    isSavedCard(card) &&
    card.type !== "model" &&
    location.pathname?.startsWith("/model")
  ) {
    dispatch(setErrorPage(NOT_FOUND_ERROR));
    return;
  }

  if (deserializedCard?.dashcardId) {
    card = await propagateDashboardParameters({
      card,
      deserializedCard,
      originalCard,
      dispatch,
    });
  }

  if (!hasCard && options.metric) {
    uiControls.isShowingSummarySidebar = true;
  }

  MetabaseAnalytics.trackStructEvent(
    "QueryBuilder",
    hasCard ? "Query Loaded" : "Query Started",
    card.dataset_query.type,
  );

  if (isSavedCard(card)) {
    dispatch(fetchAlertsForQuestion(card.id));
  }

  await dispatch(loadMetadataForCard(card));
  const metadata = getMetadata(getState());

  let question = new Question(card, metadata);
  const query = question.query();
  const { isNative, isEditable } = Lib.queryDisplayInfo(query);

  if (question.isSaved()) {
    const type = question.type();

    if (type === "question") {
      question = question.lockDisplay();
    }

    const currentUser = getUser(getState());
    if (currentUser?.is_qbnewb) {
      uiControls.isShowingNewbModal = true;
      MetabaseAnalytics.trackStructEvent("QueryBuilder", "Show Newb Modal");
    }
  }

  if (isNative) {
    const isEditing = getIsEditingInDashboard(getState());
    uiControls.isNativeEditorOpen = isEditing || !question.isSaved();
  }

  if (isNative && isEditable) {
    const query = question.legacyQuery() as NativeQuery;
    const newQuery = await updateTemplateTagNames(query, getState, dispatch);
    question = question.setLegacyQuery(newQuery);
  }

  const finalCard = question.card();

  const parameterValues = getParameterValuesForQuestion({
    card: finalCard,
    queryParams,
    metadata,
  });

  const objectId = params?.objectId || queryParams?.objectId;

  uiControls.isShowingNotebookNativePreview = getIsNotebookNativePreviewShown(
    getState(),
  );
  uiControls.notebookNativePreviewSidebarWidth =
    getNotebookNativePreviewSidebarWidth(getState());

  dispatch({
    type: INITIALIZE_QB,
    payload: {
      card: finalCard,
      originalCard,
      uiControls,
      parameterValues,
      objectId,
    },
  });

  if (uiControls.queryBuilderMode !== "notebook") {
    const { isNative } = Lib.queryDisplayInfo(question.query());
    if (question.canRun() && (question.isSaved() || !isNative)) {
      // Timeout to allow Parameters widget to set parameterValues
      setTimeout(
        () => dispatch(runQuestionQuery({ shouldUpdateUrl: false })),
        0,
      );
    }
    dispatch(
      updateUrl(question, {
        replaceState: true,
        preserveParameters: hasCard,
        objectId,
      }),
    );
  }
}

// Does the same thing as initializeQB, but doesn't catch errors.
// This function is used for the SDK, and we want to use the errors
// to determine loading states and show error messages
export const initializeQBRaw =
  (location: LocationDescriptorObject, params: QueryParams) =>
  async (dispatch: Dispatch, getState: GetState) => {
    await handleQBInit(dispatch, getState, { location, params });
  };

export const initializeQB =
  (location: LocationDescriptorObject, params: QueryParams) =>
  async (dispatch: Dispatch, getState: GetState) => {
    try {
      await handleQBInit(dispatch, getState, { location, params });
    } catch (error) {
      console.warn("initializeQB failed because of an error:", error);
      dispatch(setErrorPage(error));
    }
  };
