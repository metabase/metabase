import type { Location } from "history";

import { createThunkAction } from "metabase/lib/redux";
import { equals } from "metabase/lib/utils";
import { getLocation } from "metabase/selectors/routing";
import type { Dispatch } from "metabase-types/store";

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
import { resetUIControls, setQueryBuilderMode } from "./ui";
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
      if (!equals(card, location.state.card)) {
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

    if (location.state.objectId) {
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
      if (nextLocation.action === "POP") {
        if (
          getURL(nextLocation, { includeMode: true }) !==
          getURL(location, { includeMode: true })
        ) {
          // the browser forward/back button was pressed

          dispatch(popState(nextLocation));
        }
      } else if (
        (nextLocation.action === "PUSH" || nextLocation.action === "REPLACE") &&
        // ignore PUSH/REPLACE with `state` because they were initiated by the `updateUrl` action
        nextLocation.state === undefined
      ) {
        // a link to a different qb url was clicked
        dispatch(initializeQB(nextLocation, nextParams));
      }
    }
  };
