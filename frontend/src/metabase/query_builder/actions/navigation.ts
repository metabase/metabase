import type { Location, LocationDescriptor } from "history";
import { push, replace } from "react-router-redux";
import { createAction } from "redux-actions";
import { parse as parseUrl } from "url";

import { isEqualCard } from "metabase/lib/card";
import { createThunkAction } from "metabase/lib/redux";
import { equals } from "metabase/lib/utils";
import { getLocation } from "metabase/selectors/routing";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { isAdHocModelOrMetricQuestion } from "metabase-lib/v1/metadata/utils/models";
import type { Dispatch } from "metabase-types/store";

import {
  getCard,
  getDatasetEditorTab,
  getOriginalQuestion,
  getQueryBuilderMode,
  getQuestion,
  getUiControls,
  getZoomedObjectId,
} from "../selectors";
import { getQueryBuilderModeFromLocation } from "../typed-utils";
import {
  getCurrentQueryParams,
  getPathNameFromQueryBuilderMode,
  getURLForCardState,
} from "../utils";

import { type QueryParams, initializeQB, setCardAndRun } from "./core";
import { resetRowZoom, zoomInRow } from "./object-detail";
import { cancelQuery } from "./querying";
import { resetUIControls, setQueryBuilderMode } from "./ui";

export const SET_CURRENT_STATE = "metabase/qb/SET_CURRENT_STATE";
const setCurrentState = createAction(SET_CURRENT_STATE);

export const POP_STATE = "metabase/qb/POP_STATE";
export const popState = createThunkAction(
  POP_STATE,
  location => async (dispatch, getState) => {
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
        const shouldUpdateUrl = location.state.card.type === "model";
        const isEmptyQuery = !location.state.card.dataset_query.database;

        if (isEmptyQuery) {
          // We are being navigated back to empty notebook edtor without data source selected.
          // Reset QB state to aovid showing any data or errors from "future" history states.
          // Do not run the question as the query without data source is invalid.
          await dispatch(initializeQB(location, {}));
        } else {
          await dispatch(
            setCardAndRun(location.state.card, { shouldUpdateUrl }),
          );
          await dispatch(setCurrentState(location.state));
          await dispatch(resetUIControls());
        }
      }
    }

    const { queryBuilderMode: queryBuilderModeFromURL, ...uiControls } =
      getQueryBuilderModeFromLocation(location);

    if (getQueryBuilderMode(getState()) !== queryBuilderModeFromURL) {
      await dispatch(
        setQueryBuilderMode(queryBuilderModeFromURL, {
          ...uiControls,
          shouldUpdateUrl: queryBuilderModeFromURL === "dataset",
        }),
      );
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

export const UPDATE_URL = "metabase/qb/UPDATE_URL";
export const updateUrl = createThunkAction(
  UPDATE_URL,
  (
    question?: Question | null,
    {
      dirty,
      replaceState,
      preserveParameters = true,
      queryBuilderMode,
      datasetEditorTab,
      objectId,
    } = {},
  ) =>
    (dispatch, getState) => {
      if (!question) {
        question = getQuestion(getState());

        if (!question) {
          return;
        }
      }

      if (dirty == null) {
        const originalQuestion = getOriginalQuestion(getState());
        const uiControls = getUiControls(getState());
        const isAdHocModelOrMetric = isAdHocModelOrMetricQuestion(
          question,
          originalQuestion,
        );
        dirty =
          !originalQuestion ||
          (!isAdHocModelOrMetric &&
            (question.isDirtyComparedTo(originalQuestion) ||
              uiControls.isModifiedFromNotebook));
      }

      const { isNative } = Lib.queryDisplayInfo(question.query());
      // prevent clobbering of hash when there are fake parameters on the question
      // consider handling this in a more general way, somehow
      if (!isNative && question.parameters().length > 0) {
        dirty = true;
      }

      if (!queryBuilderMode) {
        queryBuilderMode = getQueryBuilderMode(getState());
      }
      if (!datasetEditorTab) {
        datasetEditorTab = getDatasetEditorTab(getState());
      }

      const newState = {
        card: question._doNotCallSerializableCard(),
        cardId: question.id(),
        objectId,
      };

      const { currentState } = getState().qb;
      const queryParams = preserveParameters ? getCurrentQueryParams() : {};
      const url = getURLForCardState(newState, dirty, queryParams, objectId);

      const urlParsed = parseUrl(url);
      const locationDescriptor: LocationDescriptor = {
        pathname: getPathNameFromQueryBuilderMode({
          pathname: urlParsed.pathname || "",
          queryBuilderMode,
          datasetEditorTab,
        }),
        search: urlParsed.search ?? undefined,
        hash: urlParsed.hash ?? undefined,
        state: newState,
      };

      const isSameURL =
        locationDescriptor.pathname === window.location.pathname &&
        (locationDescriptor.search || "") === (window.location.search || "") &&
        (locationDescriptor.hash || "") === (window.location.hash || "");
      const isSameCard =
        currentState && isEqualCard(currentState.card, newState.card);

      if (isSameCard && isSameURL) {
        return;
      }

      if (replaceState == null) {
        const isSameMode =
          getQueryBuilderModeFromLocation(locationDescriptor)
            .queryBuilderMode ===
          getQueryBuilderModeFromLocation(window.location).queryBuilderMode;

        // if the serialized card is identical replace the previous state instead of adding a new one
        // e.x. when saving a new card we want to replace the state and URL with one with the new card ID
        replaceState = isSameCard && isSameMode;
      }

      // this is necessary because we can't get the state from history.state
      dispatch(setCurrentState(newState));

      try {
        if (replaceState) {
          dispatch(replace(locationDescriptor));
        } else {
          dispatch(push(locationDescriptor));
        }
      } catch (e) {
        // saving the location state can exceed the session storage quota (metabase#25312)
        console.warn(e);
      }
    },
);
