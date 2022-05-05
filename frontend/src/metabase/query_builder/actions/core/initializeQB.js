import _ from "underscore";
import { getIn } from "icepick";
import querystring from "querystring";
import { normalize } from "cljs/metabase.mbql.js";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { deserializeCardFromUrl, loadCard } from "metabase/lib/card";
import * as Urls from "metabase/lib/urls";

import { cardIsEquivalent } from "metabase/meta/Card";

import { DashboardApi } from "metabase/services";

import { setErrorPage } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import { getUser } from "metabase/selectors/user";

import Databases from "metabase/entities/databases";
import Snippets from "metabase/entities/snippets";
import { fetchAlertsForQuestion } from "metabase/alert/alert";

import { getValueAndFieldIdPopulatedParametersFromCard } from "metabase/parameters/utils/cards";
import { hasMatchingParameters } from "metabase/parameters/utils/dashboards";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-values";

import Question from "metabase-lib/lib/Question";
import { getQueryBuilderModeFromLocation } from "../../utils";

import { redirectToNewQuestionFlow, updateUrl } from "../navigation";
import { cancelQuery, runQuestionQuery } from "../querying";

import { loadMetadataForCard, resetQB } from "./core";

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

function checkShouldPropagateDashboardParameters({
  cardId,
  deserializedCard,
  originalCard,
}) {
  if (!deserializedCard) {
    return false;
  }
  if (cardId && deserializedCard.parameters) {
    return true;
  }
  if (!originalCard) {
    return false;
  }
  const equalCards = cardIsEquivalent(deserializedCard, originalCard, {
    checkParameters: false,
  });
  const differentParameters = !cardIsEquivalent(
    deserializedCard,
    originalCard,
    { checkParameters: true },
  );
  return equalCards && differentParameters;
}

async function verifyMatchingDashcardAndParameters({
  dispatch,
  dashboardId,
  dashcardId,
  cardId,
  parameters,
  metadata,
}) {
  try {
    const dashboard = await DashboardApi.get({ dashId: dashboardId });
    if (
      !hasMatchingParameters({
        dashboard,
        dashcardId,
        cardId,
        parameters,
        metadata,
      })
    ) {
      dispatch(setErrorPage({ status: 403 }));
    }
  } catch (error) {
    dispatch(setErrorPage(error));
  }
}

function hasNativeSnippets(card) {
  const tags = Object.values(
    getIn(card, ["dataset_query", "native", "template-tags"]) || {},
  );
  return tags.some(t => t.type === "snippet");
}

async function checkShouldFetchSnippets({ card, dispatch, getState }) {
  const dbId = getIn(card, ["dataset_query", "database"]);

  let database = Databases.selectors.getObject(getState(), {
    entityId: dbId,
  });

  if (!database) {
    await dispatch(Databases.actions.fetchList());
    database = Databases.selectors.getObject(getState(), {
      entityId: dbId,
    });
  }

  return database && database.native_permissions === "write";
}

function getCardForBlankQuestion({ db, table, segment, metric }) {
  const databaseId = db ? parseInt(db) : undefined;
  const tableId = table ? parseInt(table) : undefined;

  let question = Question.create({ databaseId, tableId });

  if (databaseId && tableId) {
    if (segment) {
      question = question
        .query()
        .filter(["segment", parseInt(segment)])
        .question();
    }
    if (metric) {
      question = question
        .query()
        .aggregate(["metric", parseInt(metric)])
        .question();
    }
  }

  return question.card();
}

function deserializeCard(serializedCard) {
  const card = deserializeCardFromUrl(serializedCard);
  if (card.dataset_query.database != null) {
    // Ensure older MBQL is supported
    card.dataset_query = normalize(card.dataset_query);
  }
  return card;
}

async function fetchAndPrepareSavedQuestionCards(cardId) {
  const card = await loadCard(cardId);
  const originalCard = { ...card };

  // for showing the "started from" lineage correctly when adding filters/breakouts and when going back and forth
  // in browser history, the original_card_id has to be set for the current card (simply the id of card itself for now)
  card.original_card_id = card.id;

  return { card, originalCard };
}

async function fetchAndPrepareAdHocQuestionCards(deserializedCard) {
  if (!deserializedCard.original_card_id) {
    return {
      card: deserializedCard,
      originalCard: null,
    };
  }

  const originalCard = await loadCard(deserializedCard.original_card_id);

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

function resolveCards({ cardId, deserializedCard, options }) {
  if (!cardId && !deserializedCard) {
    return {
      card: getCardForBlankQuestion(options),
    };
  }
  return cardId
    ? fetchAndPrepareSavedQuestionCards(cardId)
    : fetchAndPrepareAdHocQuestionCards(deserializedCard);
}

function getInitialUIControls(location) {
  const { mode, ...uiControls } = getQueryBuilderModeFromLocation(location);
  uiControls.queryBuilderMode = mode;
  return uiControls;
}

function parseHash(hash) {
  let options = {};
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

async function handleQBInit(dispatch, getState, { location, params }) {
  dispatch(resetQB());
  dispatch(cancelQuery());

  const cardId = Urls.extractEntityId(params.slug);
  const uiControls = getInitialUIControls(location);
  const { options, serializedCard } = parseHash(location.hash);
  const hasCard = cardId || serializedCard;

  if (
    !hasCard &&
    !options.db &&
    !options.table &&
    !options.segment &&
    !options.metric
  ) {
    dispatch(redirectToNewQuestionFlow());
    return;
  }

  let shouldFetchSnippets = false;

  const deserializedCard = serializedCard
    ? deserializeCard(serializedCard)
    : null;

  const { card, originalCard } = await resolveCards({
    cardId,
    deserializedCard,
    options,
  });

  if (hasCard) {
    const shouldPropagateParameters = checkShouldPropagateDashboardParameters({
      cardId,
      deserializedCard,
      originalCard,
    });
    if (shouldPropagateParameters) {
      const metadata = getMetadata(getState());
      const { dashboardId, dashcardId, parameters } = deserializedCard;
      verifyMatchingDashcardAndParameters({
        dispatch,
        dashboardId,
        dashcardId,
        cardId: card.id,
        parameters,
        metadata,
      });

      card.parameters = parameters;
      card.dashboardId = dashboardId;
      card.dashcardId = dashcardId;
    }

    if (hasNativeSnippets(card)) {
      shouldFetchSnippets = await checkShouldFetchSnippets({
        card,
        dispatch,
        getState,
      });
    }

    uiControls.isEditing = !!options.edit;

    if (card.archived) {
      dispatch(setErrorPage(ARCHIVED_ERROR));
    }

    if (!card?.dataset && location.pathname.startsWith("/model")) {
      dispatch(setErrorPage(NOT_FOUND_ERROR));
    }
  } else {
    if (options.metric) {
      uiControls.isShowingSummarySidebar = true;
    }
  }

  MetabaseAnalytics.trackStructEvent(
    "QueryBuilder",
    hasCard ? "Query Loaded" : "Query Started",
    card.dataset_query.type,
  );

  if (card && card.id != null) {
    dispatch(fetchAlertsForQuestion(card.id));
  }

  if (card) {
    await dispatch(loadMetadataForCard(card));
  }

  let question = card && new Question(card, getMetadata(getState()));
  if (question && question.isSaved()) {
    // Don't set viz automatically for saved questions
    question = question.lockDisplay();

    const currentUser = getUser(getState());
    if (currentUser.is_qbnewb) {
      uiControls.isShowingNewbModal = true;
      MetabaseAnalytics.trackStructEvent("QueryBuilder", "Show Newb Modal");
    }
  }

  if (question && question.isNative() && shouldFetchSnippets) {
    await dispatch(Snippets.actions.fetchList());
    const snippets = Snippets.selectors.getList(getState());
    question = question.setQuery(
      question.query().updateQueryTextWithNewSnippetNames(snippets),
    );
  }

  const queryParams = location.query;
  const freshCard = question && question.card();

  const metadata = getMetadata(getState());
  const parameters = getValueAndFieldIdPopulatedParametersFromCard(
    freshCard,
    metadata,
  );
  const parameterValues = getParameterValuesByIdFromQueryParams(
    parameters,
    queryParams,
    metadata,
  );

  const objectId = params?.objectId || queryParams?.objectId;

  dispatch({
    type: INITIALIZE_QB,
    payload: {
      card: freshCard,
      originalCard,
      uiControls,
      parameterValues,
      objectId,
    },
  });

  if (question && uiControls.queryBuilderMode !== "notebook") {
    if (question.canRun()) {
      // Timeout to allow Parameters widget to set parameterValues
      setTimeout(
        () => dispatch(runQuestionQuery({ shouldUpdateUrl: false })),
        0,
      );
    }
    dispatch(
      updateUrl(freshCard, {
        replaceState: true,
        preserveParameters: hasCard,
        objectId,
      }),
    );
  }
}

export const initializeQB = (location, params) => async (
  dispatch,
  getState,
) => {
  try {
    await handleQBInit(dispatch, getState, { location, params });
  } catch (error) {
    console.warn("initializeQB failed because of an error:", error);
    dispatch(setErrorPage(error));
  }
};
