import { useElementSize } from "@mantine/hooks";
import cx from "classnames";
import type { ResizableBoxProps } from "react-resizable";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import CS from "metabase/css/core/index.css";
import type {
  SelectionRange,
  SidebarFeatures,
} from "metabase/query_builder/components/NativeQueryEditor/types";
import { QueryVisualization } from "metabase/query_builder/components/QueryVisualization";
import { SyncedParametersList } from "metabase/query_builder/components/SyncedParametersList";
import type { QueryModalType } from "metabase/query_builder/constants";
import { TimeseriesChrome } from "metabase/querying/filters/components/TimeseriesChrome";
import { Box } from "metabase/ui";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
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
import type { QueryBuilderMode } from "metabase-types/store";

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
  isResultDirty: boolean;

  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingSnippetSidebar: boolean;

  readOnly?: boolean;
  canChangeDatabase?: boolean;
  hasTopBar?: boolean;
  hasParametersList?: boolean;
  hasEditingSidebar?: boolean;
  sidebarFeatures?: SidebarFeatures;
  resizable?: boolean;
  resizableBoxProps?: Partial<Omit<ResizableBoxProps, "axis">>;

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
  mode: Mode;
  showLeftSidebar: boolean;
  showRightSidebar: boolean;
  isLiveResizable: boolean;
  parameters: UiParameter[];

  updateQuestion: (question: Question, opts?: { run?: boolean }) => void;
}

export const ViewMainContainer = (props: ViewMainContainerProps) => {
  const {
    queryBuilderMode,
    mode,
    question,
    showLeftSidebar,
    showRightSidebar,
    parameters,
    setParameterValue,
    isLiveResizable,
    updateQuestion,
  } = props;

  const { ref: mainRef, height: mainHeight } = useElementSize();
  const { ref: footerRef, height: footerHeight } = useElementSize();

  if (queryBuilderMode === "notebook") {
    // we need to render main only in view mode
    return;
  }

  const queryMode = mode && mode.queryMode();
  const { isNative } = Lib.queryDisplayInfo(question.query());
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
          noHeader
          className={CS.spread}
          mode={queryMode}
          onUpdateQuestion={updateQuestion}
        />
      </DebouncedFrame>
      <Box ref={footerRef}>
        <TimeseriesChrome question={question} updateQuestion={updateQuestion} />
        <ViewFooter className={CS.flexNoShrink} />
      </Box>
    </Box>
  );
};
