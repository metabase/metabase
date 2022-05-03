import _ from "underscore";
import { getIn } from "icepick";
import querystring from "querystring";
import { normalize } from "cljs/metabase.mbql.js";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import {
  deserializeCardFromUrl,
  loadCard,
  startNewCard,
} from "metabase/lib/card";
import * as Urls from "metabase/lib/urls";
import Utils from "metabase/lib/utils";

import { cardIsEquivalent } from "metabase/meta/Card";

import { DashboardApi } from "metabase/services";

import { setErrorPage } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";

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

export const INITIALIZE_QB = "metabase/qb/INITIALIZE_QB";
export const initializeQB = (location, params) => {
  return async (dispatch, getState) => {
    const queryParams = location.query;
    // do this immediately to ensure old state is cleared before the user sees it
    dispatch(resetQB());
    dispatch(cancelQuery());

    const { currentUser } = getState();

    const cardId = Urls.extractEntityId(params.slug);
    let card, originalCard;

    const {
      mode: queryBuilderMode,
      ...otherUiControls
    } = getQueryBuilderModeFromLocation(location);
    const uiControls = {
      isEditing: false,
      isShowingTemplateTagsEditor: false,
      queryBuilderMode,
      ...otherUiControls,
    };

    // load up or initialize the card we'll be working on
    let options = {};
    let serializedCard;
    // hash can contain either query params starting with ? or a base64 serialized card
    if (location.hash) {
      const hash = location.hash.replace(/^#/, "");
      if (hash.charAt(0) === "?") {
        options = querystring.parse(hash.substring(1));
      } else {
        serializedCard = hash;
      }
    }

    let preserveParameters = false;
    let snippetFetch;
    if (cardId || serializedCard) {
      // existing card being loaded
      try {
        // if we have a serialized card then unpack and use it
        if (serializedCard) {
          card = deserializeCardFromUrl(serializedCard);
          // if serialized query has database we normalize syntax to support older mbql
          if (card.dataset_query.database != null) {
            card.dataset_query = normalize(card.dataset_query);
          }
        } else {
          card = {};
        }

        const deserializedCard = card;

        // load the card either from `cardId` parameter or the serialized card
        if (cardId) {
          card = await loadCard(cardId);
          // when we are loading from a card id we want an explicit clone of the card we loaded which is unmodified
          originalCard = Utils.copy(card);
          // for showing the "started from" lineage correctly when adding filters/breakouts and when going back and forth
          // in browser history, the original_card_id has to be set for the current card (simply the id of card itself for now)
          card.original_card_id = card.id;

          // if there's a card in the url, it may have parameters from a dashboard
          if (deserializedCard && deserializedCard.parameters) {
            const metadata = getMetadata(getState());
            const { dashboardId, dashcardId, parameters } = deserializedCard;
            verifyMatchingDashcardAndParameters({
              dispatch,
              dashboardId,
              dashcardId,
              cardId,
              parameters,
              metadata,
            });

            card.parameters = parameters;
            card.dashboardId = dashboardId;
            card.dashcardId = dashcardId;
          }
        } else if (card.original_card_id) {
          const deserializedCard = card;
          // deserialized card contains the card id, so just populate originalCard
          originalCard = await loadCard(card.original_card_id);

          if (cardIsEquivalent(deserializedCard, originalCard)) {
            card = Utils.copy(originalCard);

            if (
              !cardIsEquivalent(deserializedCard, originalCard, {
                checkParameters: true,
              })
            ) {
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
          }
        }
        // if this card has any snippet tags we might need to fetch snippets pending permissions
        if (
          Object.values(
            getIn(card, ["dataset_query", "native", "template-tags"]) || {},
          ).filter(t => t.type === "snippet").length > 0
        ) {
          const dbId = card.database_id;
          let database = Databases.selectors.getObject(getState(), {
            entityId: dbId,
          });
          // if we haven't already loaded this database, block on loading dbs now so we can check write permissions
          if (!database) {
            await dispatch(Databases.actions.fetchList());
            database = Databases.selectors.getObject(getState(), {
              entityId: dbId,
            });
          }

          // database could still be missing if the user doesn't have any permissions
          // if the user has native permissions against this db, fetch snippets
          if (database && database.native_permissions === "write") {
            snippetFetch = dispatch(Snippets.actions.fetchList());
          }
        }

        MetabaseAnalytics.trackStructEvent(
          "QueryBuilder",
          "Query Loaded",
          card.dataset_query.type,
        );

        // if we have deserialized card from the url AND loaded a card by id then the user should be dropped into edit mode
        uiControls.isEditing = !!options.edit;

        // if this is the users first time loading a saved card on the QB then show them the newb modal
        if (cardId && currentUser.is_qbnewb) {
          uiControls.isShowingNewbModal = true;
          MetabaseAnalytics.trackStructEvent("QueryBuilder", "Show Newb Modal");
        }

        if (card.archived) {
          // use the error handler in App.jsx for showing "This question has been archived" message
          dispatch(
            setErrorPage({
              data: {
                error_code: "archived",
              },
              context: "query-builder",
            }),
          );
          card = null;
        }

        if (!card.dataset && location.pathname.startsWith("/model")) {
          dispatch(
            setErrorPage({
              data: {
                error_code: "not-found",
              },
              context: "query-builder",
            }),
          );
          card = null;
        }

        preserveParameters = true;
      } catch (error) {
        console.warn("initializeQb failed because of an error:", error);
        card = null;
        dispatch(setErrorPage(error));
      }
    } else {
      // we are starting a new/empty card
      // if no options provided in the hash, redirect to the new question flow
      if (
        !options.db &&
        !options.table &&
        !options.segment &&
        !options.metric
      ) {
        await dispatch(redirectToNewQuestionFlow());
        return;
      }

      const databaseId = options.db ? parseInt(options.db) : undefined;
      card = startNewCard("query", databaseId);

      // initialize parts of the query based on optional parameters supplied
      if (card.dataset_query.query) {
        if (options.table != null) {
          card.dataset_query.query["source-table"] = parseInt(options.table);
        }
        if (options.segment != null) {
          card.dataset_query.query.filter = [
            "segment",
            parseInt(options.segment),
          ];
        }
        if (options.metric != null) {
          // show the summarize sidebar for metrics
          uiControls.isShowingSummarySidebar = true;
          card.dataset_query.query.aggregation = [
            "metric",
            parseInt(options.metric),
          ];
        }
      }

      MetabaseAnalytics.trackStructEvent(
        "QueryBuilder",
        "Query Started",
        card.dataset_query.type,
      );
    }

    /**** All actions are dispatched here ****/

    // Fetch alerts for the current question if the question is saved
    if (card && card.id != null) {
      dispatch(fetchAlertsForQuestion(card.id));
    }
    // Fetch the question metadata (blocking)
    if (card) {
      await dispatch(loadMetadataForCard(card));
    }

    let question = card && new Question(card, getMetadata(getState()));
    if (question && question.isSaved()) {
      // loading a saved question prevents auto-viz selection
      question = question.lockDisplay();
    }

    if (question && question.isNative() && snippetFetch) {
      await snippetFetch;
      const snippets = Snippets.selectors.getList(getState());
      question = question.setQuery(
        question.query().updateQueryTextWithNewSnippetNames(snippets),
      );
    }

    card = question && question.card();
    const metadata = getMetadata(getState());
    const parameters = getValueAndFieldIdPopulatedParametersFromCard(
      card,
      metadata,
    );
    const parameterValues = getParameterValuesByIdFromQueryParams(
      parameters,
      queryParams,
      metadata,
    );

    const objectId = params?.objectId || queryParams?.objectId;

    // Update the question to Redux state together with the initial state of UI controls
    dispatch.action(INITIALIZE_QB, {
      card,
      originalCard,
      uiControls,
      parameterValues,
      objectId,
    });

    // if we have loaded up a card that we can run then lets kick that off as well
    // but don't bother for "notebook" mode
    if (question && uiControls.queryBuilderMode !== "notebook") {
      if (question.canRun()) {
        // NOTE: timeout to allow Parameters widget to set parameterValues
        setTimeout(
          () =>
            // TODO Atte Keinänen 5/31/17: Check if it is dangerous to create a question object without metadata
            dispatch(runQuestionQuery({ shouldUpdateUrl: false })),
          0,
        );
      }

      // clean up the url and make sure it reflects our card state
      dispatch(
        updateUrl(card, {
          replaceState: true,
          preserveParameters,
          objectId,
        }),
      );
    }
  };
};
