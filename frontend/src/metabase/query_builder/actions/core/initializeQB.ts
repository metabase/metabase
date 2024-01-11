import type { LocationDescriptorObject } from "history";
import querystring from "querystring";
import slugg from "slugg";
import _ from "underscore";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { deserializeCardFromUrl, loadCard } from "metabase/lib/card";
import * as Urls from "metabase/lib/urls";

import { setErrorPage } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import { getUser } from "metabase/selectors/user";

import Snippets from "metabase/entities/snippets";
import Questions from "metabase/entities/questions";
import { loadMetadataForCard } from "metabase/questions/actions";
import { fetchAlertsForQuestion } from "metabase/alert/alert";
import { getIsEditingInDashboard } from "metabase/query_builder/selectors";

import type {
  Card,
  MetricId,
  NativeQuerySnippet,
  SegmentId,
} from "metabase-types/api";
import type {
  Dispatch,
  GetState,
  QueryBuilderUIControls,
} from "metabase-types/store";
import { isSavedCard } from "metabase-types/guards";
import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/metadata/Metadata";
import { cardIsEquivalent } from "metabase-lib/queries/utils/card";
import { normalize } from "metabase-lib/queries/utils/normalize";
import Question from "metabase-lib/Question";
import type NativeQuery from "metabase-lib/queries/NativeQuery";
import { updateCardTemplateTagNames } from "metabase-lib/queries/NativeQuery";

import { getQueryBuilderModeFromLocation } from "../../typed-utils";
import { updateUrl } from "../navigation";

import { cancelQuery, runQuestionQuery } from "../querying";
import { resetQB } from "./core";
import {
  propagateDashboardParameters,
  getParameterValuesForQuestion,
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
  const segmentMetadata = Lib.segment(query, segmentId);

  if (!segmentMetadata) {
    return question;
  }

  const newQuery = Lib.filter(query, stageIndex, segmentMetadata);
  return question.setQuery(newQuery);
}

function aggregateByMetricId(question: Question, metricId: MetricId) {
  const stageIndex = -1;
  const query = question.query();
  const metricMetadata = Lib.metric(query, metricId);

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

function referencedQuestionIds(query: Lib.Query): number[] {
  const cardTemplateTags = getCardTemplateTags(query);
  const cardIds = cardTemplateTags.map(tag => tag["card-id"]);
  return cardIds;
}

function getCardTemplateTags(query: Lib.Query) {
  const templateTagsMap = Lib.templateTags(query);
  const templateTags = Object.values(templateTagsMap);
  const cardTemplateTags = templateTags.flatMap(tag =>
    tag.type === "card" ? [tag] : [],
  );
  return cardTemplateTags;
}

function getSnippetTemplateTags(query: Lib.Query) {
  const templateTagsMap = Lib.templateTags(query);
  const templateTags = Object.values(templateTagsMap);
  const snippetTemplateTags = templateTags.flatMap(tag =>
    tag.type === "snippet" ? [tag] : [],
  );
  return snippetTemplateTags;
}

function updateCardTemplateTagNames2(
  query: Lib.Query,
  cards: Card[],
): Lib.Query {
  const cardById = _.indexBy(cards, "id");
  const cardTemplateTags = getCardTemplateTags(query); // only tags for cards
  const tags = cardTemplateTags.filter(tag => cardById[tag["card-id"]]); // only tags for given cards

  // reduce over each tag, updating query text with the new tag name
  return tags.reduce((query, tag) => {
    const card = cardById[tag["card-id"]];
    const newTagName = `#${card.id}-${slugg(card.name)}`;
    return replaceTagName(query, tag.name, newTagName);
  }, query);
}

function replaceTagName(
  query: Lib.Query,
  oldTagName: string,
  newTagName: string,
): Lib.Query {
  const rawNativeQuery = Lib.rawNativeQuery(query);
  const queryText = rawNativeQuery.replace(
    tagRegex(oldTagName),
    `{{${newTagName}}}`,
  );
  return Lib.withNativeQuery(query, queryText);
}

function tagRegex(tagName: string): RegExp {
  return new RegExp(`{{\\s*${tagName}\\s*}}`, "g");
}

function hasSnippets(query: Lib.Query): boolean {
  return getSnippetTemplateTags(query).length > 0;
}

function updateSnippetNames(
  query: Lib.Query,
  snippets: NativeQuerySnippet[],
): Lib.Query {
  const snippetTemplateTags = getSnippetTemplateTags(query);
  const tagsBySnippetId = _.groupBy(
    snippetTemplateTags,
    tag => tag["snippet-id"],
  );

  if (Object.keys(tagsBySnippetId).length === 0) {
    // no need to check if there are no tags
    return query;
  }

  const originalQueryText = Lib.rawNativeQuery(query);
  let queryText = originalQueryText;

  for (const snippet of snippets) {
    const tags = tagsBySnippetId[snippet.id] || [];

    for (const tag of tags) {
      if (tag["snippet-name"] !== snippet.name) {
        queryText = queryText.replace(
          tagRegex(tag.name),
          `{{snippet: ${snippet.name}}}`,
        );
      }
    }
  }

  if (queryText === originalQueryText) {
    return query;
  }

  const newQuery = Lib.withNativeQuery(query, queryText);
  return updateSnippetsWithIds(newQuery, snippets);
}

function updateSnippetsWithIds(
  query: Lib.Query,
  snippets: NativeQuerySnippet[],
): Lib.Query {
  const snippetTemplateTags = getSnippetTemplateTags(query).filter(
    tag => tag["snippet-id"] == null,
  );
  const tagsBySnippetName = _.groupBy(
    snippetTemplateTags,
    tag => tag["snippet-name"],
  );

  if (Object.keys(tagsBySnippetName).length === 0) {
    // no need to check if there are no tags
    return query;
  }

  const templateTags = Lib.templateTags(query);

  for (const snippet of snippets) {
    for (const tag of tagsBySnippetName[snippet.name] || []) {
      templateTags[tag.name] = {
        ...tag,
        "snippet-id": snippet.id,
      };
    }
  }

  return Lib.withTemplateTags(query, templateTags);
}

export const INITIALIZE_QB = "metabase/qb/INITIALIZE_QB";

/**
 * Updates the template tag names in the query
 * to match the latest on the backend, because
 * they might have changed since the query was last opened.
 */
export async function updateTemplateTagNames2(
  query: Lib.Query,
  getState: GetState,
  dispatch: Dispatch,
): Promise<Lib.Query> {
  const referencedCards = (
    await Promise.all(
      referencedQuestionIds(query).map(async id => {
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

  query = updateCardTemplateTagNames2(query, referencedCards);
  if (hasSnippets(query)) {
    await dispatch(Snippets.actions.fetchList());
    const snippets = Snippets.selectors.getList(getState());
    query = updateSnippetNames(query, snippets);
  }
  return query;
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
    !card?.dataset &&
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

  if (question.isSaved()) {
    if (!question.isDataset()) {
      question = question.lockDisplay();
    }

    const currentUser = getUser(getState());
    if (currentUser?.is_qbnewb) {
      uiControls.isShowingNewbModal = true;
      MetabaseAnalytics.trackStructEvent("QueryBuilder", "Show Newb Modal");
    }
  }

  if (question.isNative()) {
    const isEditing = getIsEditingInDashboard(getState());
    uiControls.isNativeEditorOpen = isEditing || !question.isSaved();
  }

  if (question.isNative() && question.isQueryEditable()) {
    // const query = question.query();
    // const newQuery = await updateTemplateTagNames2(query, getState, dispatch);
    // question = question.setQuery(newQuery);

    const legacyQuery = question.legacyQuery() as NativeQuery;
    const newLegacyQuery = await updateTemplateTagNames(
      legacyQuery,
      getState,
      dispatch,
    );
    question = question.setLegacyQuery(newLegacyQuery);
  }

  const finalCard = question.card();

  const parameterValues = getParameterValuesForQuestion({
    card: finalCard,
    queryParams,
    metadata,
  });

  const objectId = params?.objectId || queryParams?.objectId;

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
    if (question.canRun() && (question.isSaved() || question.isStructured())) {
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
