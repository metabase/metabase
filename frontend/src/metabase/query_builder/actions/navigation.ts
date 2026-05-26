import type { Location } from "history";
import _ from "underscore";

import { createThunkAction } from "metabase/redux";
import { resetUIControls } from "metabase/redux/query-builder";
import type { Dispatch } from "metabase/redux/store";
import { getLocation } from "metabase/selectors/routing";

import {
  getCard,
  getDatasetEditorTab,
  getQueryBuilderMode,
  getZoomedObjectId,
} from "../selectors";
import { getQueryBuilderModeFromLocation } from "../typed-utils";

import { setCardAndRun } from "./core/core";
import { type QueryParams, initializeQB } from "./core/initializeQB";
import { resetRowZoom } from "./object-detail";
import { cancelQuery } from "./querying";
import { setCurrentState } from "./state";
import { setQueryBuilderMode } from "./ui";
import { zoomInRow } from "./zoom";

export const POP_STATE = "metabase/qb/POP_STATE";
export const popState = createThunkAction(
  POP_STATE,
  (location) => async (dispatch, getState) => {
    dispatch(cancelQuery());

    const zoomedObjectId = getZoomedObjectId(getState());
    if (zoomedObjectId) {
      const { state, query } = getLocation(getState());
      const previouslyZoomedObjectId = state?.objectId || query?.objectId;

      if (
        previouslyZoomedObjectId &&
        zoomedObjectId !== previouslyZoomedObjectId
      ) {
        dispatch(zoomInRow({ objectId: previouslyZoomedObjectId }));
      } else {
        dispatch(resetRowZoom());
      }
      return;
    }

    const card = getCard(getState());
    if (location.state && location.state.card) {
      if (!_.isEqual(card, location.state.card)) {
        const isEmptyQuery = !location.state.card.dataset_query.database;

        if (isEmptyQuery) {
          // We are being navigated back to empty notebook editor without data source selected.
          // Reset QB state to avoid showing any data or errors from "future" history states.
          // Do not run the question as the query without data source is invalid.
          await dispatch(initializeQB(location, {}));
        } else {
          await dispatch(
            setCardAndRun(location.state.card, { shouldUpdateUrl: false }),
          );
          await dispatch(setCurrentState(location.state));
          await dispatch(resetUIControls());
        }
      }
    }

    const {
      queryBuilderMode: queryBuilderModeFromURL,
      datasetEditorTab: datasetEditorTabFromURL,
      ...uiControls
    } = getQueryBuilderModeFromLocation(location);

    if (
      getQueryBuilderMode(getState()) !== queryBuilderModeFromURL ||
      getDatasetEditorTab(getState()) !== datasetEditorTabFromURL
    ) {
      await dispatch(
        setQueryBuilderMode(queryBuilderModeFromURL, {
          datasetEditorTab: datasetEditorTabFromURL,
          ...uiControls,
          shouldUpdateUrl: false,
        }),
      );
    }

    if (location.state?.objectId) {
      await dispatch(zoomInRow({ objectId: location.state.objectId }));
    }
  },
);

const getURL = (location: Location, { includeMode = false } = {}) =>
  // strip off trailing queryBuilderMode
  (includeMode
    ? location.pathname
    : location.pathname.replace(/\/(notebook|view)$/, "")) +
  location.search +
  location.hash;

// Logic for handling location changes, dispatched by top-level QueryBuilder component
export const locationChanged =
  (location: Location, nextLocation: Location, nextParams: QueryParams) =>
  (dispatch: Dispatch) => {
    if (location !== nextLocation) {
      // Treat both undefined and null as "no state" — the browser leaves
      // `history.state` as null for navigations the app didn't initiate (typed
      // URLs, browser hash changes, cy.visit), while `updateUrl` always sets a
      // `state.card` object.
      const isExternalUrlChange = nextLocation.state == null;
      const urlChanged =
        getURL(nextLocation, { includeMode: true }) !==
        getURL(location, { includeMode: true });
      if (nextLocation.action === "POP") {
        if (urlChanged) {
          // the browser forward/back button was pressed
          dispatch(popState(nextLocation));
          // POP without state means navigation to an externally-set URL (eg.
          // typing into the address bar, or a hash-only navigation that the
          // browser handled without a full page reload). Re-run init so the
          // QB picks up the new query.
          if (isExternalUrlChange) {
            dispatch(initializeQB(nextLocation, nextParams));
          }
        }
      } else if (
        (nextLocation.action === "PUSH" || nextLocation.action === "REPLACE") &&
        // ignore PUSH/REPLACE with `state` because they were initiated by the `updateUrl` action
        isExternalUrlChange
      ) {
        // a link to a different qb url was clicked
        dispatch(initializeQB(nextLocation, nextParams));
      }
    }
  };
