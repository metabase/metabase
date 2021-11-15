// import _ from "underscore";
// import { getIn } from "icepick";
// import { createAction } from "redux-actions";

// import { createThunkAction } from "metabase/lib/redux";
// import { setErrorPage } from "metabase/redux/app";
// import { loadMetadataForQuery } from "metabase/redux/metadata";

// import { loadCard } from "metabase/lib/card";
// import { defer } from "metabase/lib/promise";
// import Question from "metabase-lib/lib/Question";

// import { getSensibleDisplays } from "metabase/visualizations";

// import Databases from "metabase/entities/databases";
// import Questions from "metabase/entities/questions";
// import Snippets from "metabase/entities/snippets";

// import { getMetadata } from "metabase/selectors/metadata";

// import {
//   getCard,
//   getQuestion,
//   getOriginalQuestion,
//   getResultsMetadata,
//   getIsRunning,
//   getQueryResults,
// } from "./selectors";

// export const RESET_QB = "metabase/qb/RESET_QB";
// export const resetQB = createAction(RESET_QB);

// export const INITIALIZE_QB = "metabase/qb/INITIALIZE_QB";
// export const initializeQB = cardId => {
//   return async (dispatch, getState) => {
//     dispatch(resetQB());
//     dispatch(cancelQuery());

//     let card;

//     let snippetFetch;
//     try {
//       card = await loadCard(cardId);
//       if (
//         Object.values(
//           getIn(card, ["dataset_query", "native", "template-tags"]) || {},
//         ).filter(t => t.type === "snippet").length > 0
//       ) {
//         const dbId = card.database_id;
//         let database = Databases.selectors.getObject(getState(), {
//           entityId: dbId,
//         });
//         // if we haven't already loaded this database, block on loading dbs now so we can check write permissions
//         if (!database) {
//           await dispatch(Databases.actions.fetchList());
//           database = Databases.selectors.getObject(getState(), {
//             entityId: dbId,
//           });
//         }

//         // database could still be missing if the user doesn't have any permissions
//         // if the user has native permissions against this db, fetch snippets
//         if (database && database.native_permissions === "write") {
//           snippetFetch = dispatch(Snippets.actions.fetchList());
//         }
//       }

//       if (card.archived) {
//         // use the error handler in App.jsx for showing "This question has been archived" message
//         dispatch(
//           setErrorPage({
//             data: {
//               error_code: "archived",
//             },
//             context: "query-builder",
//           }),
//         );
//         card = null;
//       }
//     } catch (error) {
//       dispatch(setErrorPage(error));
//     }

//     await dispatch(loadMetadataForCard(card));

//     let question = new Question(card, getMetadata(getState()));

//     if (question && question.isNative() && snippetFetch) {
//       await snippetFetch;
//       const snippets = Snippets.selectors.getList(getState());
//       question = question.setQuery(
//         question.query().updateQueryTextWithNewSnippetNames(snippets),
//       );
//     }

//     dispatch.action(INITIALIZE_QB, {
//       card: question.card(),
//     });

//     if (question?.canRun()) {
//       dispatch(runQuestionQuery({ shouldUpdateUrl: false }));
//     }
//   };
// };

// export const loadMetadataForCard = card => (dispatch, getState) =>
//   dispatch(
//     loadMetadataForQuery(new Question(card, getMetadata(getState())).query()),
//   );

// export const SOFT_RELOAD_CARD = "metabase/qb/SOFT_RELOAD_CARD";
// export const softReloadCard = createThunkAction(SOFT_RELOAD_CARD, () => {
//   return async (dispatch, getState) => {
//     const outdatedCard = getCard(getState());
//     const action = await dispatch(
//       Questions.actions.fetch({ id: outdatedCard.id }, { reload: true }),
//     );

//     return Questions.HACK_getObjectFromAction(action);
//   };
// });

// export const RELOAD_CARD = "metabase/qb/RELOAD_CARD";
// export const reloadCard = createThunkAction(RELOAD_CARD, () => {
//   return async (dispatch, getState) => {
//     const outdatedCard = getCard(getState());

//     dispatch(resetQB());

//     const action = await dispatch(
//       Questions.actions.fetch({ id: outdatedCard.id }, { reload: true }),
//     );
//     const card = Questions.HACK_getObjectFromAction(action);

//     dispatch(loadMetadataForCard(card));

//     dispatch(
//       runQuestionQuery({
//         overrideWithCard: card,
//         shouldUpdateUrl: false,
//       }),
//     );

//     return card;
//   };
// });

// export const API_UPDATE_QUESTION = "metabase/qb/API_UPDATE_QUESTION";
// export const apiUpdateQuestion = question => {
//   return async (dispatch, getState) => {
//     question = question || getQuestion(getState());

//     const resultsMetadata = getResultsMetadata(getState());
//     const updatedQuestion = await question
//       .setQuery(question.query().clean())
//       .setResultsMetadata(resultsMetadata)
//       .reduxUpdate(dispatch);

//     dispatch.action(API_UPDATE_QUESTION, updatedQuestion.card());
//   };
// };

// export const RUN_QUERY = "metabase/qb/RUN_QUERY";
// export const runQuestionQuery = ({
//   ignoreCache = false,
//   overrideWithCard,
// } = {}) => {
//   return async (dispatch, getState) => {
//     const questionFromCard = card =>
//       card && new Question(card, getMetadata(getState()));

//     const question = overrideWithCard
//       ? questionFromCard(overrideWithCard)
//       : getQuestion(getState());
//     const originalQuestion = getOriginalQuestion(getState());

//     const cardIsDirty = originalQuestion
//       ? question.isDirtyComparedToWithoutParameters(originalQuestion)
//       : true;

//     const startTime = new Date();
//     const cancelQueryDeferred = defer();

//     question
//       .apiGetResults({
//         cancelDeferred: cancelQueryDeferred,
//         ignoreCache: ignoreCache,
//         isDirty: cardIsDirty,
//       })
//       .then(queryResults => {
//         return dispatch(queryCompleted(question, queryResults));
//       })
//       .catch(error => dispatch(queryErrored(startTime, error)));

//     dispatch.action(RUN_QUERY, { cancelQueryDeferred });
//   };
// };

// export const CLEAR_QUERY_RESULT = "metabase/query_builder/CLEAR_QUERY_RESULT";
// export const clearQueryResult = createAction(CLEAR_QUERY_RESULT);

// export const QUERY_COMPLETED = "metabase/qb/QUERY_COMPLETED";
// export const queryCompleted = (question, queryResults) => {
//   return async (dispatch, getState) => {
//     const [{ data }] = queryResults;
//     const [{ data: prevData }] = getQueryResults(getState()) || [{}];
//     const originalQuestion = getOriginalQuestion(getState());
//     const dirty =
//       !originalQuestion ||
//       (originalQuestion && question.isDirtyComparedTo(originalQuestion));

//     if (dirty) {
//       if (question.isNative()) {
//         question = question.syncColumnsAndSettings(
//           originalQuestion,
//           queryResults[0],
//         );
//       }
//       // Only update the display if the question is new or has been changed.
//       // Otherwise, trust that the question was saved with the correct display.
//       question = question
//         // if we are going to trigger autoselection logic, check if the locked display no longer is "sensible".
//         .maybeUnlockDisplay(
//           getSensibleDisplays(data),
//           prevData && getSensibleDisplays(prevData),
//         )
//         .setDefaultDisplay()
//         .switchTableScalar(data);
//     }

//     dispatch.action(QUERY_COMPLETED, { card: question.card(), queryResults });
//   };
// };

// export const QUERY_ERRORED = "metabase/qb/QUERY_ERRORED";
// export const queryErrored = createThunkAction(
//   QUERY_ERRORED,
//   (startTime, error) => {
//     return async (dispatch, getState) => {
//       if (error && error.isCancelled) {
//         // cancelled, do nothing
//         return null;
//       } else {
//         return { error: error, duration: new Date() - startTime };
//       }
//     };
//   },
// );

// // cancelQuery
// export const CANCEL_QUERY = "metabase/qb/CANCEL_QUERY";
// export const cancelQuery = () => (dispatch, getState) => {
//   const isRunning = getIsRunning(getState());
//   if (isRunning) {
//     const { cancelQueryDeferred } = getState().qb;
//     if (cancelQueryDeferred) {
//       cancelQueryDeferred.resolve();
//     }
//     return { type: CANCEL_QUERY };
//   }
// };
