import type { LocationDescriptorObject } from "history";
import { replace } from "react-router-redux";

import { cardApi, databaseApi, snippetApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import {
  cardIsEquivalent,
  deserializeCard,
  parseHash,
} from "metabase/common/utils/card";
import {
  getIsEditingInDashboard,
  getNotebookNativePreviewSidebarWidth,
} from "metabase/query_builder/selectors";
import { loadMetadataForCard } from "metabase/questions/actions";
import { setErrorPage } from "metabase/redux/app";
import type { DispatchFn } from "metabase/redux/hooks";
import { fetchDatabaseMetadata, updateMetadata } from "metabase/redux/metadata";
import { INITIALIZE_QB, resetQB } from "metabase/redux/query-builder";
import type {
  Dispatch,
  GetState,
  QueryBuilderUIControls,
} from "metabase/redux/store";
import { fetchTableMetadataAndForeignKeys } from "metabase/redux/tables";
import { FieldSchema } from "metabase/schema";
import { getMetadata } from "metabase/selectors/metadata";
import { canUserCreateQueries, getUser } from "metabase/selectors/user";
import * as Urls from "metabase/urls";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { updateCardTemplateTagNames } from "metabase-lib/v1/queries/NativeQuery";
import type { Card, SegmentId } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";
import { isSavedCard } from "metabase-types/guards";

import { getQueryBuilderModeFromLocation } from "../../typed-utils";
import { cancelQuery, runQuestionQuery } from "../querying";
import { updateUrl } from "../url";

import { loadCard } from "./card";
import {
  getParameterValuesForQuestion,
  propagateDashboardParameters,
} from "./parameterUtils";

type BlankQueryOptions = {
  db?: string;
  table?: string;
  segment?: string;
};

export type QueryParams = BlankQueryOptions & {
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

  let question = Question.create({
    DEPRECATED_RAW_MBQL_databaseId: databaseId,
    DEPRECATED_RAW_MBQL_tableId: tableId,
    metadata,
  });

  if (databaseId && tableId) {
    if (typeof segmentId === "number") {
      question = filterBySegmentId(question, segmentId);
    }
  }

  return question.card();
}

function getCardForBlankNativeQuestion(
  metadata: Metadata,
  options: BlankQueryOptions,
) {
  const databaseId = options.db ? parseInt(options.db) : undefined;

  // TODO don't use DEPRECATED_RAW_MBQL_* as it'd be better to:
  // 1° load the db first
  // 2° use the lib to create a provider
  // 3° then create a native query
  const question = Question.create({
    DEPRECATED_RAW_MBQL_type: "native",
    DEPRECATED_RAW_MBQL_databaseId: databaseId,
    metadata,
  });

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

async function fetchAndPrepareSavedQuestionCards(
  {
    cardId,
    token,
  }: {
    cardId: string | number;
    token?: EntityToken | null;
  },
  dispatch: Dispatch,
  getState: GetState,
) {
  const card = await loadCard({ cardId, token }, { dispatch, getState });
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

  const originalCard = await loadCard(
    { cardId: deserializedCard.original_card_id },
    {
      dispatch,
      getState,
    },
  );

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
  originalCard?: Card | null;
};

export async function resolveCards({
  cardId,
  token,
  deserializedCard,
  options,
  dispatch,
  getState,
  questionType,
}: {
  cardId?: string | number;
  token?: EntityToken | null;
  deserializedCard?: Card;
  options: BlankQueryOptions;
  dispatch: Dispatch;
  getState: GetState;
  questionType?: "native" | "gui";
}): Promise<ResolveCardsResult> {
  if (!cardId && !deserializedCard) {
    const metadata = getMetadata(getState());

    const card =
      questionType === "native"
        ? getCardForBlankNativeQuestion(metadata, options)
        : getCardForBlankQuestion(metadata, options);

    return { card };
  }
  return cardId
    ? fetchAndPrepareSavedQuestionCards({ cardId, token }, dispatch, getState)
    : fetchAndPrepareAdHocQuestionCards(
        deserializedCard as Card,
        dispatch,
        getState,
      );
}

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
      query.referencedQuestionIds().map(async (id) => {
        try {
          return await runRtkEndpoint(
            { id, ignore_error: true },
            dispatch,
            cardApi.endpoints.getCard,
          );
        } catch {
          return null;
        }
      }),
    )
  ).filter(isNotNull);

  query = updateCardTemplateTagNames(query, referencedCards);
  if (query.hasSnippets()) {
    const action = (dispatch as DispatchFn)(
      snippetApi.endpoints.listSnippets.initiate(undefined, {
        forceRefetch: true,
      }),
    );
    try {
      const snippets = await action.unwrap();
      query = query.updateSnippetNames(snippets);
    } finally {
      action.unsubscribe();
    }
  }
  return query;
}

// Tracks the most recent initializeQB invocation so that stale, in-flight
// calls (whose location has been superseded by a newer navigation before they
// finished awaiting metadata) don't overwrite the QB state with results
// belonging to the previous URL.
let latestInitializeQBVersion = 0;

async function handleQBInit(
  dispatch: Dispatch,
  getState: GetState,
  {
    location,
    params,
    isStale,
  }: {
    location: LocationDescriptorObject;
    params: QueryParams;
    isStale: () => boolean;
  },
) {
  dispatch(resetQB());
  dispatch(cancelQuery());

  // Preload the full database list up front so the data selector already has it
  // when it mounts
  const databasesPromise = runRtkEndpoint(
    { "can-query": true },
    dispatch,
    databaseApi.endpoints.listDatabases,
    { forceRefetch: false },
  ).catch((error) => {
    console.error(
      "Failed to load database list during QB initialization",
      error,
    );
  });

  const queryParams = location.query;
  const isTableRoute = location.pathname?.startsWith("/table");
  const slugEntityId = Urls.extractEntityId(params.slug);
  // On the /table/:slug route the slug identifies a table, not a saved card.
  const cardId = isTableRoute ? undefined : slugEntityId;
  const uiControls: UIControls = getQueryBuilderModeFromLocation(location);
  let { options, serializedCard } = parseHash(location.hash);
  const currentUser = getUser(getState());

  if (isTableRoute && slugEntityId != null) {
    await dispatch(fetchTableMetadataAndForeignKeys({ id: slugEntityId }));
    if (isStale()) {
      return;
    }
    const table = getMetadata(getState()).table(slugEntityId);
    if (!table) {
      dispatch(setErrorPage(NOT_FOUND_ERROR));
      return;
    }
    await dispatch(fetchDatabaseMetadata(table.db_id));
    if (isStale()) {
      return;
    }
    // The /table URL only carries the table id; resolve its db so the QB can
    // build the table's default ad-hoc question, just like `?db=&table=`.
    options = {
      ...options,
      db: String(table.db_id),
      table: String(slugEntityId),
    };
  }

  const hasCard = cardId || serializedCard;

  if (uiControls.queryBuilderMode === "notebook") {
    if (!canUserCreateQueries(getState())) {
      dispatch(replace(Urls.unauthorized()));
      return;
    }
  }

  const deserializedCard = serializedCard
    ? deserializeCard(serializedCard)
    : undefined;

  let { card, originalCard } = await resolveCards({
    cardId,
    deserializedCard,
    options,
    dispatch,
    getState,
  });

  if (isStale()) {
    return;
  }

  if (isSavedCard(card) && card.archived && !currentUser) {
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

  if (
    isSavedCard(card) &&
    card.type !== "metric" &&
    location.pathname?.startsWith("/metric")
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

  if (isStale()) {
    return;
  }

  await dispatch(loadMetadataForCard(card));

  if (isStale()) {
    return;
  }

  // Populate the metadata store with param_fields from the card response.
  // This ensures field filter widgets have has_field_values even when the user
  // lacks create-queries permission on the underlying table (GHY-1605).
  if (card.param_fields) {
    await dispatch(
      updateMetadata(Object.values(card.param_fields).flat(), [FieldSchema]),
    );
  }

  const metadata = getMetadata(getState());

  let question = new Question(card, metadata);
  const query = question.query();
  const { isNative, isEditable } = Lib.queryDisplayInfo(query);

  // For unsaved native queries, ensure template tags are parsed from query text
  // This handles cases like AI-generated queries with model references {{#1}}
  if (isNative && !question.isSaved()) {
    question = question.setQuery(
      Lib.withNativeQuery(
        question.query(),
        Lib.rawNativeQuery(question.query()),
      ),
    );
  }

  if (question.isSaved()) {
    const type = question.type();

    if (type === "question") {
      question = question.lockDisplay();
    }

    if (currentUser?.is_qbnewb) {
      uiControls.isShowingNewbModal = true;
    }
  }

  if (isNative) {
    const isEditing = getIsEditingInDashboard(getState());
    uiControls.isNativeEditorOpen = isEditing || !question.isSaved();
  }

  if (isNative && isEditable) {
    const query = question.legacyNativeQuery() as NativeQuery;
    const newQuery = await updateTemplateTagNames(query, getState, dispatch);
    question = question.setLegacyQuery(newQuery);
  }

  if (isStale()) {
    return;
  }

  const finalCard = question.card();

  const parameterValues = getParameterValuesForQuestion({
    card: finalCard,
    queryParams,
    metadata,
  });

  const objectId = params?.objectId || queryParams?.objectId;

  uiControls.notebookNativePreviewSidebarWidth =
    getNotebookNativePreviewSidebarWidth(getState());

  // make sure db list is loaded
  await databasesPromise;

  if (isStale()) {
    return;
  }

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
        preserveNavbarState: true,
        objectId,
      }),
    );
  }
}

export const initializeQB =
  (location: LocationDescriptorObject, params: QueryParams) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const version = ++latestInitializeQBVersion;
    const isStale = () => version !== latestInitializeQBVersion;
    try {
      await handleQBInit(dispatch, getState, { location, params, isStale });
    } catch (error) {
      if (isStale()) {
        return;
      }
      console.warn("initializeQB failed because of an error:", error);
      dispatch(setErrorPage(error));
    }
  };
