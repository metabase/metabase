import { useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useMemo, useState } from "react";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import CS from "metabase/css/core/index.css";
import { FixSqlQueryButton } from "metabase/metabot/components/FixSqlQueryButton";
import { HasResultsAlertPrompt } from "metabase/notifications/HasResultsAlertPrompt";
import { SyncedParametersList } from "metabase/parameters/components/SyncedParametersList";
import { Mode } from "metabase/querying/click-actions/Mode";
import { getQueryMode } from "metabase/querying/click-actions/lib/modes";
import {
  QueryVisualization,
  type QueryVisualizationProps,
} from "metabase/querying/components/QueryVisualization";
import type { SelectionRange } from "metabase/querying/editor/types";
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
import { TableFlow } from "../../TableFlow/TableFlow";
import { getGalleryTableId, searchRows } from "../../TableFlow/utils";
import { ViewNativeQueryEditor } from "../ViewNativeQueryEditor";

import ViewMainContainerS from "./ViewMainContainer.module.css";

const clickActionMode = new Mode(getQueryMode, {
  hasColumnShortcutActions: true,
});

interface ViewMainContainerProps {
  question: Question;
  result?: QueryVisualizationProps["result"];
  rawSeries?: QueryVisualizationProps["rawSeries"];
  isGalleryOpen: boolean;
  /** Height of the scrollable area below the header. */
  viewportHeight: number;
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
    result,
    rawSeries,
    isGalleryOpen,
    viewportHeight,
  } = props;

  const isTableDisplay = question.display() === "table";

  const { onZoomRow, ...visualizationResultProps } =
    useVisualizationResultQBProps();
  const [searchText, setSearchText] = useState("");
  const searchedResultProps = useMemo(() => {
    const rowSearch = result?.data
      ? searchRows(result.data.rows, isTableDisplay ? searchText : "")
      : null;
    if (!rowSearch) {
      return { result, rawSeries, onZoomRow };
    }
    return {
      result: result && {
        ...result,
        data: { ...result.data, rows: rowSearch.rows },
      },
      rawSeries: rawSeries?.map((series) => ({
        ...series,
        data: { ...series.data, rows: rowSearch.rows },
      })),
      // map back to the unfiltered row so object detail opens the right record
      onZoomRow: (rowIndex: number) =>
        onZoomRow(rowSearch.sourceIndexes[rowIndex] ?? rowIndex),
    };
  }, [result, rawSeries, onZoomRow, searchText, isTableDisplay]);

  const { ref: mainRef, height: mainHeight } = useElementSize();

  if (queryBuilderMode === "notebook") {
    // we need to render main only in view mode
    return;
  }

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);
  const isSidebarOpen = showLeftSidebar || showRightSidebar;

  const galleryTableId = getGalleryTableId(question);

  const visualization = (
    <QueryVisualization
      {...props}
      {...visualizationResultProps}
      {...searchedResultProps}
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
  );

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
        <ViewNativeQueryEditor {...props} availableHeight={mainHeight} />
      ) : (
        <SyncedParametersList
          className={ViewMainContainerS.StyledSyncedParametersList}
          parameters={parameters}
          dashboardId={question.getDashboardProps().dashboardId}
          setParameterValue={setParameterValue}
          commitImmediately
        />
      )}

      {isNative ? (
        <DebouncedFrame
          className={ViewMainContainerS.StyledDebouncedFrame}
          enabled={!isLiveResizable}
          resetKey={props.isRunning}
        >
          {visualization}
        </DebouncedFrame>
      ) : (
        <TableFlow
          key={galleryTableId}
          question={question}
          onQuestionChange={(nextQuestion) =>
            updateQuestion(nextQuestion, {
              // display and settings changes reuse the results already on screen
              run: !Lib.areLegacyQueriesEqual(
                nextQuestion.datasetQuery(),
                question.datasetQuery(),
              ),
            })
          }
          tableId={galleryTableId}
          isGalleryOpen={isGalleryOpen}
          viewportHeight={viewportHeight}
          rawSeries={rawSeries ?? null}
          result={result ?? null}
          searchText={isTableDisplay ? searchText : null}
          onSearchTextChange={setSearchText}
        >
          <DebouncedFrame
            className={CS.spread}
            enabled={!isLiveResizable}
            resetKey={props.isRunning}
          >
            {visualization}
          </DebouncedFrame>
        </TableFlow>
      )}
      <ObjectDetailSidesheet />
    </Box>
  );
};
