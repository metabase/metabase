import { parse as parseUrl } from "url";

import type { LocationDescriptor } from "history";
import { push, replace } from "react-router-redux";

import { isEqualCard } from "metabase/lib/card";
import { createThunkAction } from "metabase/lib/redux";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { isAdHocModelOrMetricQuestion } from "metabase-lib/v1/metadata/utils/models";

import {
  getCard,
  getDatasetEditorTab,
  getOriginalQuestion,
  getQueryBuilderMode,
  getQuestion,
  getUiControls,
} from "../selectors";
import { getQueryBuilderModeFromLocation } from "../typed-utils";
import {
  getCurrentQueryParams,
  getPathNameFromQueryBuilderMode,
  getURLForCardState,
} from "../utils";

import { setCurrentState } from "./state";

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

      const originalQuestion = getOriginalQuestion(getState());
      const isAdHocModelOrMetric = isAdHocModelOrMetricQuestion(
        question,
        originalQuestion,
      );

      if (dirty == null) {
        const uiControls = getUiControls(getState());
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

      const card = isAdHocModelOrMetric ? getCard(getState()) : question.card();
      const newState = {
        card,
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
