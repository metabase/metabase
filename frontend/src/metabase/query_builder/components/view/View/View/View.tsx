import cx from "classnames";
import { forwardRef } from "react";
import type { ConnectedProps } from "react-redux";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { deletePermanently } from "metabase/archive/actions";
import type { CollectionPickerValueItem } from "metabase/common/components/CollectionPicker";
import ExplicitSize from "metabase/components/ExplicitSize";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import Toaster from "metabase/components/Toaster";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import Bookmarks from "metabase/entities/bookmarks";
import Questions from "metabase/entities/questions";
import { connect } from "metabase/lib/redux";
import {
  rememberLastUsedDatabase,
  setArchivedQuestion,
} from "metabase/query_builder/actions";
import { type QueryModalType, SIDEBAR_SIZES } from "metabase/query_builder/constants";
import { MetricEditor } from "metabase/querying/metrics/components/MetricEditor";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Card, CardId, Database, DatabaseId, Dataset, Field, RawSeries, VisualizationSettings } from "metabase-types/api";
import type { Dispatch, QueryBuilderMode } from "metabase-types/store";
import type { InitialChartSettingState } from "metabase-types/store/qb";

import { DatasetEditor } from "../../../DatasetEditor";
import { QueryModals } from "../../../QueryModals";
import { SavedQuestionIntroModal } from "../../../SavedQuestionIntroModal";
import ViewSidebar from "../../ViewSidebar";
import { NotebookContainer } from "../NotebookContainer";
import { ViewHeaderContainer } from "../ViewHeaderContainer";
import { ViewLeftSidebarContainer } from "../ViewLeftSidebarContainer";
import { ViewMainContainer } from "../ViewMainContainer";
import { ViewRightSidebarContainer } from "../ViewRightSidebarContainer";

import S from "./View.module.css";


type QueryBuilderViewProps = QueryBuilderViewReduxProps & OwnProps;

interface OwnProps {
  isShowingNewbModal: boolean;
  closeQbNewbModal: () => void;
  onDismissToast: () => void;
  onConfirmToast: () => void;
  isShowingToaster: boolean;
  isHeaderVisible: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  reportTimezone: string;
  readOnly: boolean;
  isDirty: boolean;
  isRunning: boolean;
  isRunnable: boolean;
  isResultDirty: boolean;
  hasVisualizeButton: boolean;
  runQuestionQuery: () => Promise<void>;
  cancelQuery: () => void;
  setQueryBuilderMode: (mode: QueryBuilderMode) => void;
  runDirtyQuestionQuery: () => void;
  isShowingQuestionInfoSidebar: boolean;
  isShowingQuestionSettingsSidebar: boolean;
  cancelQuestionChanges: () => void;
  onCreate: (question: Question) => Promise<void>;
  onSave: (
    question: Question,
    config?: { rerunQuery: boolean },
  ) => Promise<void>;
  onChangeLocation: (location: string) => void;
  modal: QueryModalType;
  modalContext: number;
  card: Card;
  onCloseModal: () => void;
  onOpenModal: (modalType: QueryModalType) => void;
  originalQuestion: Question;
  isShowingChartSettingsSidebar: boolean;
  isShowingChartTypeSidebar: boolean;
  onCloseChartSettings: () => void;
  addField: (field: Field) => void;
  initialChartSetting: InitialChartSettingState;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
  onOpenChartType: () => void;
  visualizationSettings: VisualizationSettings;
  showSidebarTitle: boolean;
  isShowingSummarySidebar: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingDataReference: boolean;
  isShowingSnippetSidebar: boolean;
  isShowingTimelineSidebar: boolean;
  isShowingAIQuestionAnalysisSidebar: boolean;
  queryBuilderMode: QueryBuilderMode;
  result: Dataset;
  rawSeries: RawSeries;
  databases: Database[];
  question: Question;
}


const ViewInner = forwardRef<HTMLDivElement, QueryBuilderViewProps>(function _ViewInner(props, ref) {
  const {
    question,
    result,
    rawSeries,
    databases,
    isShowingNewbModal,
    isShowingTimelineSidebar,
    isShowingAIQuestionAnalysisSidebar,
    queryBuilderMode,
    closeQbNewbModal,
    onDismissToast,
    onConfirmToast,
    isShowingToaster,
    isHeaderVisible,
    updateQuestion,
    reportTimezone,
    readOnly,
    isDirty,
    isRunning,
    isRunnable,
    isResultDirty,
    hasVisualizeButton,
    runQuestionQuery,
    cancelQuery,
    setQueryBuilderMode,
    runDirtyQuestionQuery,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
    cancelQuestionChanges,
    onCreate,
    onSave,
    onChangeLocation,
    modal,
    modalContext,
    card,
    onCloseModal,
    onOpenModal,
    originalQuestion,
    isShowingChartSettingsSidebar,
    isShowingChartTypeSidebar,
    isShowingSummarySidebar,
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
  } = props;

  // if we don't have a question at all or no databases then we are initializing, so keep it simple
  if (!question || !databases) {
    return (
      <LoadingAndErrorWrapper className={CS.fullHeight} loading ref={ref as any} />
    );
  }

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(question.query());

  const isNewQuestion = !isNative && Lib.sourceTableOrCardId(query) === null;
  const isModel = question.type() === "model";
  const isMetric = question.type() === "metric";

  if ((isModel || isMetric) && queryBuilderMode === "dataset") {
    return (
      <>
        {isModel && <DatasetEditor {...props} ref={ref as any} />}
        {isMetric && (
          <MetricEditor
            ref={ref as any}
            question={question}
            result={result}
            rawSeries={rawSeries}
            reportTimezone={reportTimezone}
            isDirty={isDirty}
            isResultDirty={isResultDirty}
            isRunning={isRunning}
            onChange={async (q) => { updateQuestion(q); }}
            onCreate={async (q: Question, _options?: any): Promise<Question> => {
              try {
                const result = await onCreate(q);
                setQueryBuilderMode("view");
                return result as unknown as Question;
              } catch {
                return q;
              }
            }}
            onSave={async (q) => {
              await onSave(q);
              setQueryBuilderMode("view");
            }}
            onCancel={async (q) => {
              if (q.isSaved()) {
                cancelQuestionChanges();
                runDirtyQuestionQuery();
                setQueryBuilderMode("view");
              } else {
                onChangeLocation("/");
              }
            }}
            onRunQuery={async () => { runQuestionQuery(); }}
            onCancelQuery={async () => { cancelQuery(); }}
          />
        )}
        <QueryModals
          onSave={async (q, config) => { await onSave(q, config); }}
          onCreate={async (q: Question, _options?: any): Promise<Question> => {
            try {
              return (await onCreate(q)) as unknown as Question;
            } catch {
              return q;
            }
          }}
          modal={modal}
          modalContext={modalContext}
          card={card}
          question={question}
          onCloseModal={onCloseModal}
          onOpenModal={onOpenModal}
          setQueryBuilderMode={setQueryBuilderMode}
          originalQuestion={originalQuestion}
          onChangeLocation={onChangeLocation}
        />
      </>
    );
  }

  const isNotebookContainerOpen =
    isNewQuestion || queryBuilderMode === "notebook";

  const showLeftSidebar =
    isShowingChartSettingsSidebar || isShowingChartTypeSidebar;
  const showRightSidebar =
    isShowingAIQuestionAnalysisSidebar ||
    isShowingTimelineSidebar ||
    isShowingQuestionInfoSidebar ||
    isShowingQuestionSettingsSidebar ||
    (!isNative && isShowingSummarySidebar) ||
    (isNative &&
      (isShowingTemplateTagsEditor ||
        isShowingDataReference ||
        isShowingSnippetSidebar));

  const rightSidebarWidth = match({
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
  })
    .with({ isShowingTimelineSidebar: true }, () => SIDEBAR_SIZES.TIMELINE)
    .with({ isShowingQuestionInfoSidebar: true }, () => 0)
    .with({ isShowingQuestionSettingsSidebar: true }, () => 0)
    .otherwise(() => SIDEBAR_SIZES.NORMAL);
  return (
    <div className={CS.fullHeight} ref={ref}>
      <Flex
        className={cx(QueryBuilderS.QueryBuilder, S.QueryBuilderViewRoot)}
        data-testid="query-builder-root"
      >
        {isHeaderVisible && (
          <ViewHeaderContainer
            question={question}
            onUnarchive={props.onUnarchive}
            onMove={props.onMove}
            onDeletePermanently={props.onDeletePermanently}
            isObjectDetail={false}
            isAdditionalInfoVisible={undefined}
            onOpenQuestionInfo={() => { }}
            onSave={() => { }}
            onOpenModal={() => { }}
            isNavBarOpen={false}
            originalQuestion={undefined}
            result={result}
            queryBuilderMode={queryBuilderMode}
            updateQuestion={updateQuestion as any}
            isBookmarked={false}
            toggleBookmark={() => { }}
            isRunnable={isRunnable}
            isRunning={isRunning}
            isNativeEditorOpen={false}
            isShowingSummarySidebar={false}
            isDirty={isDirty}
            isResultDirty={isResultDirty}
            isActionListVisible={false}
            runQuestionQuery={() => { }}
            cancelQuery={() => { }}
            onEditSummary={() => { }}
            onCloseSummary={() => { }}
            setQueryBuilderMode={() => { }}
            isShowingQuestionInfoSidebar={false}
            onCloseQuestionInfo={() => { }}
            className={undefined}
          />
        )}

        <Flex className={S.QueryBuilderContentContainer}>
          {!isNative && (
            <NotebookContainer
              isOpen={isNotebookContainerOpen}
              updateQuestion={async (q) => { updateQuestion(q); }}
              reportTimezone={reportTimezone}
              readOnly={readOnly}
              question={question}
              isDirty={isDirty}
              isRunnable={isRunnable}
              isResultDirty={isResultDirty}
              hasVisualizeButton={hasVisualizeButton}
              runQuestionQuery={async () => { runQuestionQuery(); }}
              setQueryBuilderMode={setQueryBuilderMode as any}
            />
          )}
          <ViewSidebar side="left" isOpen={showLeftSidebar}>
            <ViewLeftSidebarContainer
              question={question}
              result={result}
              isShowingChartSettingsSidebar={isShowingChartSettingsSidebar}
              isShowingChartTypeSidebar={isShowingChartTypeSidebar}
            />
          </ViewSidebar>
          <ViewMainContainer
            question={question}
            query={question.query() as any}
            viewHeight={0}
            isNativeEditorOpen={false}
            isRunnable={isRunnable}
            isRunning={isRunning}
            isResultDirty={isResultDirty}
            isShowingDataReference={isShowingDataReference}
            isShowingTemplateTagsEditor={isShowingTemplateTagsEditor}
            isShowingSnippetSidebar={isShowingSnippetSidebar}
            runQuery={() => { }}
            toggleEditor={() => { }}
            handleResize={() => { }}
            setDatasetQuery={async () => question}
            runQuestionQuery={() => { }}
            setNativeEditorSelectedRange={() => { }}
            openDataReferenceAtQuestion={() => { }}
            openSnippetModalWithSelectedText={() => { }}
            insertSnippet={() => { }}
            setParameterValue={() => { }}
            setParameterValueToDefault={() => { }}
            onOpenModal={() => { }}
            toggleDataReference={() => { }}
            toggleTemplateTagsEditor={() => { }}
            toggleSnippetSidebar={() => { }}
            closeSnippetModal={() => { }}
            queryBuilderMode={queryBuilderMode}
            mode={undefined as any}
            showLeftSidebar={showLeftSidebar}
            showRightSidebar={showRightSidebar}
            isLiveResizable={false}
            parameters={[]}
            updateQuestion={updateQuestion as any}
          />
          <ViewSidebar
            side="right"
            isOpen={showRightSidebar}
            width={rightSidebarWidth}
          >
            <ViewRightSidebarContainer {...props} />
          </ViewSidebar>
        </Flex>
      </Flex>

      {isShowingNewbModal && (
        <SavedQuestionIntroModal
          question={question}
          isShowingNewbModal={isShowingNewbModal}
          onClose={() => closeQbNewbModal()}
        />
      )}

      <Toaster
        message={t`Would you like to be notified when this question is done loading?`}
        isShown={isShowingToaster}
        onDismiss={onDismissToast}
        onConfirm={onConfirmToast}
        fixed
      />
    </div>
  );
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onSetDatabaseId: (id: DatabaseId) => dispatch(rememberLastUsedDatabase(id)),
  onUnarchive: async (question: Question) => {
    await dispatch(setArchivedQuestion(question, false));
    await dispatch(Bookmarks.actions.invalidateLists());
  },
  onMove: (question: Question, newCollection: CollectionPickerValueItem) =>
    dispatch(
      Questions.actions.setCollection({ id: question.id() }, newCollection, {
        notify: { undo: false },
      }),
    ),
  onDeletePermanently: (id: CardId) => {
    const deleteAction = Questions.actions.delete({ id });
    dispatch(deletePermanently(deleteAction));
  },
});


const connector = connect(null, mapDispatchToProps, null, { forwardRef: true });
export type QueryBuilderViewReduxProps = ConnectedProps<typeof connector>;

export const View = _.compose(
  ExplicitSize({ refreshMode: "debounceLeading" }),
  connector,
)(ViewInner);
