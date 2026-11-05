import { useEffect, useMemo } from "react";
import { useLatest } from "react-use";

import { useInlineSQLPrompt } from "metabase/metabot/components/MetabotInlineSQLPrompt";
import { MetabotPromptButton } from "metabase/metabot/components/MetabotPromptButton";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import {
  addSuggestedCodeEdit,
  getMetabotSuggestedCodeEdit,
  getMetabotVisible,
  getOmnibotSqlModeEntry,
  metabotSqlApplied,
  metabotSqlHidden,
  metabotSqlShown,
  removeSuggestedCodeEdit,
} from "metabase/metabot/state";
import { NativeQueryParametersList } from "metabase/parameters/components/NativeQueryParametersList";
import { NativeQueryEditor } from "metabase/querying/components/NativeQueryEditor";
import type { SelectionRange } from "metabase/querying/editor/types";
import { useDispatch, useSelector } from "metabase/redux";
import { setIsNativeEditorOpen as setIsNativeEditorOpenAction } from "metabase/redux/query-builder";
import type { QueryModalType } from "metabase/redux/store";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Card,
  CardId,
  DatabaseId,
  NativeQuerySnippet,
  ParameterId,
} from "metabase-types/api";

import { getHighlightedNativeQueryLineNumbers } from "../../../../store/selectors";

import NativeQueryEditorS from "./ViewNativeQueryEditor.module.css";

interface ViewNativeQueryEditorProps {
  height?: number;
  card?: Card;

  question: Question;
  query: NativeQuery;

  nativeEditorSelectedText?: string;
  modalSnippet?: NativeQuerySnippet;
  highlightedLineNumbers?: number[];

  isInitiallyOpen?: boolean;
  isNativeEditorOpen: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;

  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingSnippetSidebar: boolean;

  readOnly?: boolean;
  canChangeDatabase?: boolean;
  resizable?: boolean;

  editorContext?: "question";

  runQuery: () => void;
  toggleEditor: () => void;
  handleResize: () => void;
  setDatasetQuery: (query: NativeQuery) => void;
  runQuestionQuery: (opts?: {
    overrideWithQuestion?: Question;
    shouldUpdateUrl?: boolean;
  }) => void;
  setNativeEditorSelectedRange: (range: SelectionRange[]) => void;
  openDataReferenceAtQuestion: (id: CardId) => void;
  openSnippetModalWithSelectedText: () => void;
  insertSnippet: (snippet: NativeQuerySnippet) => void;
  setIsNativeEditorOpen?: (
    isOpen: boolean,
    toggleDataReference?: boolean,
  ) => void;
  setParameterValue: (parameterId: ParameterId, value: string) => void;
  onOpenModal: (modalType: QueryModalType) => void;
  toggleDataReference: () => void;
  toggleTemplateTagsEditor: () => void;
  toggleSnippetSidebar: () => void;
  cancelQuery?: () => void;
  closeSnippetModal: () => void;
  onSetDatabaseId?: (id: DatabaseId) => void;
  availableHeight?: number;
}

const QB_BUFFER_ID = "qb";

const getNativeSql = (question: Question) =>
  Lib.rawNativeQuery(question.query());

/**
 * Applies and runs a Metabot SQL edit that the sidebar marked as auto-apply.
 * When the SQL changed since the last Metabot change, the edit shows as a diff.
 */
function useMetabotAutoApply({
  question,
  setDatasetQuery,
  runQuestionQuery,
}: Pick<
  ViewNativeQueryEditorProps,
  "question" | "setDatasetQuery" | "runQuestionQuery"
>) {
  const dispatch = useDispatch();
  const codeEdit = useSelector((state) =>
    getMetabotSuggestedCodeEdit(state, QB_BUFFER_ID),
  );
  const lastAppliedSql = useSelector(
    (state) => getOmnibotSqlModeEntry(state)?.lastAppliedSql,
  );

  useEffect(() => {
    if (!codeEdit?.autoApply) {
      return;
    }
    const legacyNativeQuery = question.legacyNativeQuery();
    const sql = getNativeSql(question);
    if (!legacyNativeQuery || sql !== lastAppliedSql) {
      dispatch(addSuggestedCodeEdit({ ...codeEdit, autoApply: false }));
      dispatch(setIsNativeEditorOpenAction(true));
      return;
    }

    // Remove the edit first, so that a rerender does not apply it twice.
    dispatch(removeSuggestedCodeEdit(QB_BUFFER_ID));
    const isSqlShown = codeEdit.show_sql === true;
    if (codeEdit.value === sql) {
      // The SQL does not change ("show me the SQL"), so the results stay.
      dispatch(metabotSqlApplied({ sql, isSqlShown }));
      return;
    }

    const nextQuery = legacyNativeQuery.setQueryText(codeEdit.value);
    // `setDatasetQuery` returns nothing, so build the same question here.
    const nextQuestion = question.setDatasetQuery(nextQuery.datasetQuery());
    setDatasetQuery(nextQuery);
    dispatch(
      metabotSqlApplied({ sql: getNativeSql(nextQuestion), isSqlShown }),
    );
    if (nextQuestion.canRun()) {
      // `setDatasetQuery` updates the store question before it returns. So this
      // runs that question, and updates the URL, as the Run button does.
      runQuestionQuery();
    }
  }, [
    codeEdit,
    lastAppliedSql,
    question,
    setDatasetQuery,
    runQuestionQuery,
    dispatch,
  ]);
}

/**
 * Wraps `setIsNativeEditorOpen`: opening the editor by hand asks to see the SQL,
 * and closing it asks for the chart again. The wrapper keeps its identity
 * while the user types.
 */
function useSetIsNativeEditorOpen({
  question,
  isNativeEditorOpen,
  setIsNativeEditorOpen,
}: Pick<
  ViewNativeQueryEditorProps,
  "question" | "isNativeEditorOpen" | "setIsNativeEditorOpen"
>) {
  const dispatch = useDispatch();
  const questionRef = useLatest(question);
  const isNativeEditorOpenRef = useLatest(isNativeEditorOpen);

  return useMemo(
    () =>
      setIsNativeEditorOpen &&
      ((isOpen: boolean, toggleDataReference?: boolean) => {
        const wasOpen = isNativeEditorOpenRef.current;
        if (isOpen !== wasOpen) {
          const sql = getNativeSql(questionRef.current);
          dispatch(
            isOpen ? metabotSqlShown({ sql }) : metabotSqlHidden({ sql }),
          );
        }
        setIsNativeEditorOpen(isOpen, toggleDataReference);
      }),
    [setIsNativeEditorOpen, dispatch, questionRef, isNativeEditorOpenRef],
  );
}

export const ViewNativeQueryEditor = (props: ViewNativeQueryEditorProps) => {
  const { question, isNativeEditorOpen, onSetDatabaseId } = props;
  useMetabotAutoApply(props);

  const setIsNativeEditorOpen = useSetIsNativeEditorOpen({
    question,
    isNativeEditorOpen,
    setIsNativeEditorOpen: props.setIsNativeEditorOpen,
  });

  const legacyNativeQuery = question.legacyNativeQuery();
  const highlightedLineNumbers = useSelector(
    getHighlightedNativeQueryLineNumbers,
  );

  const inlineSQLPrompt = useInlineSQLPrompt(question, "qb");
  const isMetabotSidebarOpen = useSelector((state) =>
    getMetabotVisible(state, "omnibot"),
  );
  const { hasSqlGenerationAccess } = useUserMetabotPermissions();

  // Normally, when users open native models,
  // they open an ad-hoc GUI question using the model as a data source
  // (using the `/dataset` endpoint instead of the `/card/:id/query`)
  // However, users without data permission open a real model as they can't use the `/dataset` endpoint
  // So the model is opened as an underlying native question and the query editor becomes visible
  // This check makes it hide the editor in this particular case
  // More details: https://github.com/metabase/metabase/pull/20161
  const { isEditable } = Lib.queryDisplayInfo(question.query());
  if ((question.type() === "model" && !isEditable) || !legacyNativeQuery) {
    return null;
  }

  return (
    <Box className={NativeQueryEditorS.NativeQueryEditorContainer}>
      <NativeQueryEditor
        {...props}
        query={legacyNativeQuery}
        highlightedLineNumbers={highlightedLineNumbers}
        isInitiallyOpen={isNativeEditorOpen}
        canAutoOpenDataReference={!isMetabotSidebarOpen}
        onSetDatabaseId={onSetDatabaseId}
        extensions={inlineSQLPrompt?.extensions}
        proposedQuestion={inlineSQLPrompt?.proposedQuestion}
        onAcceptProposed={inlineSQLPrompt?.handleAcceptProposed}
        onRejectProposed={inlineSQLPrompt?.handleRejectProposed}
        hasSqlGenerationAccess={hasSqlGenerationAccess}
        setIsNativeEditorOpen={setIsNativeEditorOpen}
      >
        <NativeQueryEditor.TopBar leftContent={<NativeQueryParametersList />}>
          <NativeQueryEditor.Sidebar
            promptButton={
              inlineSQLPrompt && (
                <MetabotPromptButton
                  isPromptInputOpen={inlineSQLPrompt.isPromptOpen}
                  onClick={inlineSQLPrompt.togglePrompt}
                />
              )
            }
          />
          <NativeQueryEditor.VisibilityToggler />
        </NativeQueryEditor.TopBar>
        <NativeQueryEditor.RunButton />
      </NativeQueryEditor>
      {inlineSQLPrompt?.portalElement}
    </Box>
  );
};
