// import Utils from "metabase/lib/utils";
// import { handleActions } from "redux-actions";

// import {
//   RESET_QB,
//   INITIALIZE_QB,
//   SOFT_RELOAD_CARD,
//   RELOAD_CARD,
//   RUN_QUERY,
//   CLEAR_QUERY_RESULT,
//   CANCEL_QUERY,
//   QUERY_COMPLETED,
//   QUERY_ERRORED,
// } from "./actions";

// // the card that is actively being worked on
// export const card = handleActions(
//   {
//     [RESET_QB]: { next: (state, { payload }) => null },
//     [INITIALIZE_QB]: {
//       next: (state, { payload }) => (payload ? payload.card : null),
//     },
//     [SOFT_RELOAD_CARD]: { next: (state, { payload }) => payload },
//     [RELOAD_CARD]: { next: (state, { payload }) => payload },
//   },
//   null,
// );

// // a copy of the card being worked on at it's last known saved state.  if the card is NEW then this should be null.
// // NOTE: we use JSON serialization/deserialization to ensure a deep clone of the object which is required
// //       because we can't have any links between the active card being modified and the "originalCard" for testing dirtiness
// // ALSO: we consistently check for payload.id because an unsaved card has no "originalCard"
// export const originalCard = handleActions(
//   {
//     [INITIALIZE_QB]: {
//       next: (state, { payload }) =>
//         payload.originalCard ? Utils.copy(payload.originalCard) : null,
//     },
//     [RELOAD_CARD]: {
//       next: (state, { payload }) => (payload.id ? Utils.copy(payload) : null),
//     },
//   },
//   null,
// );

// export const lastRunCard = handleActions(
//   {
//     [RESET_QB]: { next: (state, { payload }) => null },
//     [QUERY_COMPLETED]: { next: (state, { payload }) => payload.card },
//     [QUERY_ERRORED]: { next: (state, { payload }) => null },
//   },
//   null,
// );

// // The results of a query execution.  optionally an error if the query fails to complete successfully.
// export const queryResults = handleActions(
//   {
//     [RESET_QB]: { next: (state, { payload }) => null },
//     [QUERY_COMPLETED]: {
//       next: (state, { payload }) => payload.queryResults,
//     },
//     [QUERY_ERRORED]: {
//       next: (state, { payload }) => (payload ? [payload] : state),
//     },
//     [CLEAR_QUERY_RESULT]: { next: (state, { payload }) => null },
//   },
//   null,
// );

// // promise used for tracking a query execution in progress.  when a query is started we capture this.
// export const cancelQueryDeferred = handleActions(
//   {
//     [RUN_QUERY]: {
//       next: (state, { payload: { cancelQueryDeferred } }) =>
//         cancelQueryDeferred,
//     },
//     [CANCEL_QUERY]: { next: (state, { payload }) => null },
//     [QUERY_COMPLETED]: { next: (state, { payload }) => null },
//     [QUERY_ERRORED]: { next: (state, { payload }) => null },
//   },
//   null,
// );
