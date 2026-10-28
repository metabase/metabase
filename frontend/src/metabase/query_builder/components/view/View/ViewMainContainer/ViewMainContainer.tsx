import { useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useMemo } from "react";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import CS from "metabase/css/core/index.css";
import { FixSqlQueryButton } from "metabase/metabot/components/FixSqlQueryButton";
import { HasResultsAlertPrompt } from "metabase/notifications/HasResultsAlertPrompt";
import { SyncedParametersList } from "metabase/parameters/components/SyncedParametersList";
import { Mode } from "metabase/querying/click-actions/Mode";
import { getQueryMode } from "metabase/querying/click-actions/lib/modes";
import { QueryVisualization } from "metabase/querying/components/QueryVisualization";
import type { SelectionRange } from "metabase/querying/editor/types";
import { TimeseriesChrome } from "metabase/querying/filters/components/TimeseriesChrome";
import type { QueryBuilderMode, QueryModalType } from "metabase/redux/store";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  CardId,
  DatabaseId,
  NativeQuerySnippet,
  ParameterId,
} from "metabase-types/api";

import { useVisualizationResultQBProps } from "../../../../hooks";
import { ObjectDetailSidesheet } from "../../../ObjectDetailSidesheet";
import { useColumnFormulaBar } from "../../ColumnFormulaBar";
import { ViewFooter } from "../../ViewFooter";
import { ViewNativeQueryEditor } from "../ViewNativeQueryEditor";

import ViewMainContainerS from "./ViewMainContainer.module.css";

interface ViewMainContainerProps {
  question: Question;
  query: NativeQuery;

  nativeEditorSelectedText?: string;
  modalSnippet?: NativeQuerySnippet;
  highlightedLineNumbers?: number[];

  isInitiallyOpen?: boolean;
  isNativeEditorOpen: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  isDirty: boolean;
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
  setDatasetQuery: (query: NativeQuery) => Promise<Question>;
  runQuestionQuery: (opts?: {
    overrideWithQuestion?: Question;
    shouldUpdateUrl?: boolean;
  }) => void;
  setNativeEditorSelectedRange: (range: SelectionRange[]) => void;
  openDataReferenceAtQuestion: (id: CardId) => void;
  openSnippetModalWithSelectedText: () => void;
  insertSnippet: (snippet: NativeQuerySnippet) => void;
  setIsNativeEditorOpen?: (isOpen: boolean) => void;
  setParameterValue: (parameterId: ParameterId, value: string) => void;
  setParameterValueToDefault: (parameterId: ParameterId) => void;
  onOpenModal: (modalType: QueryModalType) => void;
  toggleDataReference: () => void;
  toggleTemplateTagsEditor: () => void;
  toggleSnippetSidebar: () => void;
  cancelQuery?: () => void;
  closeSnippetModal: () => void;
  onSetDatabaseId?: (id: DatabaseId) => void;

  queryBuilderMode: QueryBuilderMode;
  showLeftSidebar: boolean;
  showRightSidebar: boolean;
  isLiveResizable: boolean;
  parameters: UiParameter[];

  updateQuestion: (question: Question, opts?: { run?: boolean }) => void;
}

export const ViewMainContainer = (props: ViewMainContainerProps) => {
  const {
    queryBuilderMode,
    question,
    isDirty,
    showLeftSidebar,
    showRightSidebar,
    parameters,
    setParameterValue,
    isLiveResizable,
    updateQuestion,
  } = props;

  const visualizationResultProps = useVisualizationResultQBProps();

  const { ref: mainRef, height: mainHeight } = useElementSize();
  const { ref: footerRef, height: footerHeight } = useElementSize();

  // the add-column button opens the formula bar on a new custom column, where one can be added
  const columnFormula = useColumnFormulaBar({
    question,
    onQuestionChange: (nextQuestion) =>
      updateQuestion(nextQuestion, { run: true }),
  });
  const { isNative, isEditable } = Lib.queryDisplayInfo(question.query());
  const onAddColumn = !isNative && isEditable ? columnFormula.open : undefined;
  const clickActionMode = useMemo(
    () =>
      new Mode(getQueryMode, { hasColumnShortcutActions: true, onAddColumn }),
    [onAddColumn],
  );

  if (queryBuilderMode === "notebook") {
    // we need to render main only in view mode
    return;
  }

  const isSidebarOpen = showLeftSidebar || showRightSidebar;

  const availableHeight = mainHeight ? mainHeight - footerHeight : undefined;

  return (
    <Box
      component="main"
      className={cx(ViewMainContainerS.QueryBuilderMain, {
        [ViewMainContainerS.isSidebarOpen]: isSidebarOpen,
      })}
      data-testid="query-builder-main"
      ref={mainRef}
    >
      {isNative ? (
        <ViewNativeQueryEditor {...props} availableHeight={availableHeight} />
      ) : (
        <SyncedParametersList
          className={ViewMainContainerS.StyledSyncedParametersList}
          parameters={parameters}
          dashboardId={question.getDashboardProps().dashboardId}
          setParameterValue={setParameterValue}
          commitImmediately
        />
      )}

      <DebouncedFrame
        className={ViewMainContainerS.StyledDebouncedFrame}
        enabled={!isLiveResizable}
        resetKey={props.isRunning}
      >
        <QueryVisualization
          {...props}
          {...visualizationResultProps}
          noHeader
          className={CS.spread}
          mode={clickActionMode}
          hasColumnReordering
          noResultsAction={
            !isDirty && <HasResultsAlertPrompt question={question} />
          }
          errorAction={<FixSqlQueryButton />}
          onUpdateQuestion={updateQuestion}
        />
      </DebouncedFrame>
      <ObjectDetailSidesheet />
      {columnFormula.bar}
      <Box ref={footerRef} className={ViewMainContainerS.Footer}>
        <TimeseriesChrome question={question} updateQuestion={updateQuestion} />
        <ViewFooter className={CS.flexNoShrink} />
      </Box>
    </Box>
  );
};
