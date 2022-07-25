import _ from "underscore";
import { assocIn } from "icepick";

import {
  getTemplateTagsForParameters,
  getTemplateTagParameters,
} from "metabase/parameters/utils/cards";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import {
  getFirstQueryResult,
  getIsEditing,
  getIsShowingTemplateTagsEditor,
  getQueryBuilderMode,
  getQuestion,
  getRawSeries,
} from "../../selectors";
import { getNextTemplateTagVisibilityState } from "../../utils";

import { updateUrl } from "../navigation";
import { setIsShowingTemplateTagsEditor } from "../native";
import { runQuestionQuery } from "../querying";
import { onCloseQuestionInfo, setQueryBuilderMode } from "../ui";

import { loadMetadataForCard } from "./metadata";
import { getQuestionWithDefaultVisualizationSettings } from "./utils";

function hasNewColumns(question, queryResult) {
  // NOTE: this assume column names will change
  // technically this is wrong because you could add and remove two columns with the same name
  const query = question.query();
  const previousColumns =
    (queryResult && queryResult.data.cols.map(col => col.name)) || [];
  const nextColumns =
    query instanceof StructuredQuery ? query.columnNames() : [];
  return _.difference(nextColumns, previousColumns).length > 0;
}

/**
 * Replaces the currently active question with the given Question object.
 * Also shows/hides the template tag editor if the number of template tags has changed.
 */
export const UPDATE_QUESTION = "metabase/qb/UPDATE_QUESTION";
export const updateQuestion = (
  newQuestion,
  { run = false, shouldUpdateUrl = false } = {},
) => {
  return async (dispatch, getState) => {
    const oldQuestion = getQuestion(getState());
    const mode = getQueryBuilderMode(getState());

    const shouldConvertIntoAdHoc = newQuestion.query().isEditable();

    // TODO Atte Keinänen 6/2/2017 Ways to have this happen automatically when modifying a question?
    // Maybe the Question class or a QB-specific question wrapper class should know whether it's being edited or not?
    if (
      shouldConvertIntoAdHoc &&
      !getIsEditing(getState()) &&
      newQuestion.isSaved() &&
      mode !== "dataset"
    ) {
      newQuestion = newQuestion.withoutNameAndId();

      // When the dataset query changes, we should loose the dataset flag,
      // to start building a new ad-hoc question based on a dataset
      if (newQuestion.isDataset()) {
        newQuestion = newQuestion.setDataset(false);
        dispatch(onCloseQuestionInfo());
      }
    }

    const queryResult = getFirstQueryResult(getState());
    newQuestion = newQuestion.syncColumnsAndSettings(oldQuestion, queryResult);

    if (run === "auto") {
      run = hasNewColumns(newQuestion, queryResult);
    }

    if (!newQuestion.canAutoRun()) {
      run = false;
    }

    // <PIVOT LOGIC>
    // We have special logic when going to, coming from, or updating a pivot table.
    const isPivot = newQuestion.display() === "pivot";
    const wasPivot = oldQuestion.display() === "pivot";
    const queryHasBreakouts =
      isPivot &&
      newQuestion.isStructured() &&
      newQuestion.query().breakouts().length > 0;

    // we can only pivot queries with breakouts
    if (isPivot && queryHasBreakouts) {
      // compute the pivot setting now so we can query the appropriate data
      const series = assocIn(
        getRawSeries(getState()),
        [0, "card"],
        newQuestion.card(),
      );
      const key = "pivot_table.column_split";
      const setting = getQuestionWithDefaultVisualizationSettings(
        newQuestion,
        series,
      ).setting(key);
      newQuestion = newQuestion.updateSettings({ [key]: setting });
    }

    if (
      // switching to pivot
      (isPivot && !wasPivot && queryHasBreakouts) ||
      // switching away from pivot
      (!isPivot && wasPivot) ||
      // updating the pivot rows/cols
      (isPivot &&
        queryHasBreakouts &&
        !_.isEqual(
          newQuestion.setting("pivot_table.column_split"),
          oldQuestion.setting("pivot_table.column_split"),
        ))
    ) {
      run = true; // force a run when switching to/from pivot or updating it's setting
    }
    // </PIVOT LOGIC>

    // Native query should never be in notebook mode (metabase#12651)
    if (mode === "notebook" && newQuestion.isNative()) {
      await dispatch(
        setQueryBuilderMode("view", {
          shouldUpdateUrl: false,
        }),
      );
    }

    const newDatasetQuery = newQuestion.query().datasetQuery();
    // Sync card's parameters with the template tags;
    if (newDatasetQuery.type === "native") {
      const templateTags = getTemplateTagsForParameters(newQuestion.card());
      const parameters = getTemplateTagParameters(templateTags);
      newQuestion = newQuestion.setParameters(parameters);
    }

    // Replace the current question with a new one
    await dispatch({
      type: UPDATE_QUESTION,
      payload: { card: newQuestion.card() },
    });

    if (shouldUpdateUrl) {
      dispatch(updateUrl(null, { dirty: true }));
    }

    // See if the template tags editor should be shown/hidden
    const isTemplateTagEditorVisible = getIsShowingTemplateTagsEditor(
      getState(),
    );
    const nextTagEditorVisibilityState = getNextTemplateTagVisibilityState({
      oldQuestion,
      newQuestion,
      isTemplateTagEditorVisible,
      queryBuilderMode: mode,
    });
    if (nextTagEditorVisibilityState !== "deferToCurrentState") {
      dispatch(
        setIsShowingTemplateTagsEditor(
          nextTagEditorVisibilityState === "visible",
        ),
      );
    }

    try {
      if (
        !_.isEqual(
          oldQuestion.query().dependentMetadata(),
          newQuestion.query().dependentMetadata(),
        )
      ) {
        await dispatch(loadMetadataForCard(newQuestion.card()));
      }

      // setDefaultQuery requires metadata be loaded, need getQuestion to use new metadata
      const question = getQuestion(getState());
      const questionWithDefaultQuery = question.setDefaultQuery();
      if (!questionWithDefaultQuery.isEqual(question)) {
        await dispatch.action(UPDATE_QUESTION, {
          card: questionWithDefaultQuery.setDefaultDisplay().card(),
        });
      }
    } catch (e) {
      // this will fail if user doesn't have data permissions but thats ok
      console.warn("Couldn't load metadata", e);
    }

    // run updated query
    if (run) {
      dispatch(runQuestionQuery());
    }
  };
};
