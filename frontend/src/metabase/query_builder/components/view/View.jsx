/* eslint-disable react/prop-types */

import { connect } from "react-redux";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { deletePermanently } from "metabase/archive/actions";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import ExplicitSize from "metabase/components/ExplicitSize";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Toaster from "metabase/components/Toaster";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import Bookmarks from "metabase/entities/bookmarks";
import Questions from "metabase/entities/questions";
import {
  rememberLastUsedDatabase,
  setArchivedQuestion,
} from "metabase/query_builder/actions";
import { SIDEBAR_SIZES } from "metabase/query_builder/constants";
import { TimeseriesChrome } from "metabase/querying/filters/components/TimeseriesChrome";
import { MetricEditor } from "metabase/querying/metrics/components/MetricEditor";
import { Transition } from "metabase/ui";
import * as Lib from "metabase-lib";

import DatasetEditor from "../DatasetEditor";
import NativeQueryEditor from "../NativeQueryEditor";
import { QueryModals } from "../QueryModals";
import QueryVisualization from "../QueryVisualization";
import { SavedQuestionIntroModal } from "../SavedQuestionIntroModal";
import DataReference from "../dataref/DataReference";
import { SnippetSidebar } from "../template_tags/SnippetSidebar";
import { TagEditorSidebar } from "../template_tags/TagEditorSidebar";

import NewQuestionHeader from "./NewQuestionHeader";
import { NotebookContainer } from "./View/NotebookContainer";
import {
  BorderedViewTitleHeader,
  NativeQueryEditorContainer,
  QueryBuilderContentContainer,
  QueryBuilderMain,
  QueryBuilderViewHeaderContainer,
  QueryBuilderViewRoot,
  StyledDebouncedFrame,
  StyledSyncedParametersList,
} from "./View.styled";
import { ViewFooter } from "./ViewFooter";
import ViewSidebar from "./ViewSidebar";
import { ChartSettingsSidebar } from "./sidebars/ChartSettingsSidebar";
import { ChartTypeSidebar } from "./sidebars/ChartTypeSidebar";
import { QuestionInfoSidebar } from "./sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "./sidebars/QuestionSettingsSidebar";
import { SummarizeSidebar } from "./sidebars/SummarizeSidebar";
import TimelineSidebar from "./sidebars/TimelineSidebar";

const fadeIn = {
  in: { opacity: 1 },
  out: { opacity: 0 },
  transitionProperty: "opacity",
};

const ViewHeaderContainer = props => {
  const { question, onUnarchive, onMove, onDeletePermanently } = props;
  const query = question.query();
  const card = question.card();
  const { isNative } = Lib.queryDisplayInfo(query);

  const isNewQuestion = !isNative && Lib.sourceTableOrCardId(query) === null;

  return (
    <QueryBuilderViewHeaderContainer>
      {card.archived && (
        <ArchivedEntityBanner
          name={card.name}
          entityType={card.type}
          canWrite={card.can_write}
          canRestore={card.can_restore}
          canDelete={card.can_delete}
          onUnarchive={() => onUnarchive(question)}
          onMove={collection => onMove(question, collection)}
          onDeletePermanently={() => onDeletePermanently(card.id)}
        />
      )}

      <BorderedViewTitleHeader
        {...props}
        style={{
          transition: "opacity 300ms linear",
          opacity: isNewQuestion ? 0 : 1,
        }}
      />
      {/*This is used so that the New Question Header is unmounted after the animation*/}
      <Transition mounted={isNewQuestion} transition={fadeIn} duration={300}>
        {style => <NewQuestionHeader className={CS.spread} style={style} />}
      </Transition>
    </QueryBuilderViewHeaderContainer>
  );
};

const ViewMainContainer = props => {
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

  if (queryBuilderMode === "notebook") {
    // we need to render main only in view mode
    return;
  }

  const queryMode = mode && mode.queryMode();
  const { isNative } = Lib.queryDisplayInfo(question.query());
  const isSidebarOpen = showLeftSidebar || showRightSidebar;

  return (
    <QueryBuilderMain
      isSidebarOpen={isSidebarOpen}
      data-testid="query-builder-main"
    >
      {isNative ? (
        <ViewNativeQueryEditor {...props} />
      ) : (
        <StyledSyncedParametersList
          parameters={parameters}
          setParameterValue={setParameterValue}
          commitImmediately
        />
      )}

      <StyledDebouncedFrame enabled={!isLiveResizable}>
        <QueryVisualization
          {...props}
          noHeader
          className={CS.spread}
          mode={queryMode}
        />
      </StyledDebouncedFrame>
      <TimeseriesChrome
        question={question}
        updateQuestion={updateQuestion}
        className={CS.flexNoShrink}
      />
      <ViewFooter className={CS.flexNoShrink} />
    </QueryBuilderMain>
  );
};

const ViewLeftSidebarContainer = ({
  question,
  result,
  isShowingChartSettingsSidebar,
  isShowingChartTypeSidebar,
  onCloseChartSettings,
  addField,
  initialChartSetting,
  onReplaceAllVisualizationSettings,
  onOpenChartType,
  visualizationSettings,
  showSidebarTitle,
}) =>
  match({
    isShowingChartSettingsSidebar,
    isShowingChartTypeSidebar,
  })
    .with(
      {
        isShowingChartSettingsSidebar: true,
      },
      () => (
        <ChartSettingsSidebar
          question={question}
          result={result}
          addField={addField}
          initialChartSetting={initialChartSetting}
          onReplaceAllVisualizationSettings={onReplaceAllVisualizationSettings}
          onOpenChartType={onOpenChartType}
          visualizationSettings={visualizationSettings}
          showSidebarTitle={showSidebarTitle}
          onClose={onCloseChartSettings}
        />
      ),
    )
    .with(
      {
        isShowingChartTypeSidebar: true,
      },
      () => <ChartTypeSidebar question={question} result={result} />,
    )
    .otherwise(() => null);

const ViewNativeQueryEditor = props => {
  const {
    question,
    height,
    isDirty,
    isNativeEditorOpen,
    card,
    setParameterValueToDefault,
    onSetDatabaseId,
  } = props;

  const legacyQuery = question.legacyQuery();

  // Normally, when users open native models,
  // they open an ad-hoc GUI question using the model as a data source
  // (using the `/dataset` endpoint instead of the `/card/:id/query`)
  // However, users without data permission open a real model as they can't use the `/dataset` endpoint
  // So the model is opened as an underlying native question and the query editor becomes visible
  // This check makes it hide the editor in this particular case
  // More details: https://github.com/metabase/metabase/pull/20161
  const { isEditable } = Lib.queryDisplayInfo(question.query());
  if (question.type() === "model" && !isEditable) {
    return null;
  }

  return (
    <NativeQueryEditorContainer>
      <NativeQueryEditor
        {...props}
        query={legacyQuery}
        viewHeight={height}
        isOpen={legacyQuery.isEmpty() || isDirty}
        isInitiallyOpen={isNativeEditorOpen}
        datasetQuery={card && card.dataset_query}
        setParameterValueToDefault={setParameterValueToDefault}
        onSetDatabaseId={onSetDatabaseId}
      />
    </NativeQueryEditorContainer>
  );
};

const ViewRightSidebarContainer = props => {
  const {
    question,
    deselectTimelineEvents,
    hideTimelineEvents,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
    isShowingSummarySidebar,
    isShowingTimelineSidebar,
    onCloseQuestionInfo,
    onCloseSummary,
    onCloseTimelines,
    onOpenModal,
    onSave,
    selectTimelineEvents,
    selectedTimelineEventIds,
    showTimelineEvents,
    timelines,
    updateQuestion,
    visibleTimelineEventIds,
    xDomain,
  } = props;

  const { isNative } = Lib.queryDisplayInfo(question.query());

  return !isNative ? (
    <StructuredQueryRightSidebar
      deselectTimelineEvents={deselectTimelineEvents}
      hideTimelineEvents={hideTimelineEvents}
      isShowingQuestionInfoSidebar={isShowingQuestionInfoSidebar}
      isShowingQuestionSettingsSidebar={isShowingQuestionSettingsSidebar}
      isShowingSummarySidebar={isShowingSummarySidebar}
      isShowingTimelineSidebar={isShowingTimelineSidebar}
      onCloseQuestionInfo={onCloseQuestionInfo}
      onCloseSummary={onCloseSummary}
      onCloseTimelines={onCloseTimelines}
      onOpenModal={onOpenModal}
      onSave={onSave}
      question={question}
      selectTimelineEvents={selectTimelineEvents}
      selectedTimelineEventIds={selectedTimelineEventIds}
      showTimelineEvents={showTimelineEvents}
      timelines={timelines}
      updateQuestion={updateQuestion}
      visibleTimelineEventIds={visibleTimelineEventIds}
      xDomain={xDomain}
    />
  ) : (
    <NativeQueryRightSidebar {...props} />
  );
};

const StructuredQueryRightSidebar = ({
  deselectTimelineEvents,
  hideTimelineEvents,
  isShowingQuestionInfoSidebar,
  isShowingQuestionSettingsSidebar,
  isShowingSummarySidebar,
  isShowingTimelineSidebar,
  onCloseQuestionInfo,
  onCloseSummary,
  onCloseTimelines,
  onOpenModal,
  onSave,
  question,
  selectTimelineEvents,
  selectedTimelineEventIds,
  showTimelineEvents,
  timelines,
  updateQuestion,
  visibleTimelineEventIds,
  xDomain,
}) =>
  match({
    isSaved: question.isSaved(),
    isShowingSummarySidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
  })
    .with(
      {
        isShowingSummarySidebar: true,
      },
      () => (
        <SummarizeSidebar
          query={question.query()}
          onQueryChange={nextQuery => {
            const datesetQuery = Lib.toLegacyQuery(nextQuery);
            const nextQuestion = question.setDatasetQuery(datesetQuery);
            updateQuestion(nextQuestion.setDefaultDisplay(), {
              run: true,
            });
          }}
          onClose={onCloseSummary}
        />
      ),
    )
    .with({ isShowingTimelineSidebar: true }, () => (
      <TimelineSidebar
        question={question}
        timelines={timelines}
        visibleTimelineEventIds={visibleTimelineEventIds}
        selectedTimelineEventIds={selectedTimelineEventIds}
        xDomain={xDomain}
        onShowTimelineEvents={showTimelineEvents}
        onHideTimelineEvents={hideTimelineEvents}
        onSelectTimelineEvents={selectTimelineEvents}
        onDeselectTimelineEvents={deselectTimelineEvents}
        onOpenModal={onOpenModal}
        onClose={onCloseTimelines}
      />
    ))
    .with(
      {
        isSaved: true,
        isShowingQuestionInfoSidebar: true,
      },
      () => (
        <QuestionInfoSidebar
          question={question}
          onSave={onSave}
          onClose={onCloseQuestionInfo}
        />
      ),
    )
    .with(
      {
        isSaved: true,
        isShowingQuestionSettingsSidebar: true,
      },
      () => <QuestionSettingsSidebar question={question} />,
    )
    .otherwise(() => null);

const NativeQueryRightSidebar = props => {
  const {
    question,
    toggleTemplateTagsEditor,
    toggleDataReference,
    toggleSnippetSidebar,
    showTimelineEvent,
    showTimelineEvents,
    hideTimelineEvents,
    selectTimelineEvents,
    deselectTimelineEvents,
    onCloseTimelines,
    onSave,
    onCloseQuestionInfo,
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
  } = props;

  return match({
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
  })
    .with({ isShowingTemplateTagsEditor: true }, () => (
      <TagEditorSidebar
        {...props}
        query={question.legacyQuery()}
        onClose={toggleTemplateTagsEditor}
      />
    ))
    .with({ isShowingDataReference: true }, () => (
      <DataReference {...props} onClose={toggleDataReference} />
    ))
    .with({ isShowingSnippetSidebar: true }, () => (
      <SnippetSidebar {...props} onClose={toggleSnippetSidebar} />
    ))
    .with({ isShowingTimelineSidebar: true }, () => (
      <TimelineSidebar
        {...props}
        onShowTimelineEvent={showTimelineEvent}
        onShowTimelineEvents={showTimelineEvents}
        onHideTimelineEvents={hideTimelineEvents}
        onSelectTimelineEvents={selectTimelineEvents}
        onDeselectTimelineEvents={deselectTimelineEvents}
        onClose={onCloseTimelines}
      />
    ))
    .with({ isShowingQuestionInfoSidebar: true }, () => (
      <QuestionInfoSidebar
        question={question}
        onSave={onSave}
        onClose={onCloseQuestionInfo}
      />
    ))
    .with({ isShowingQuestionSettingsSidebar: true }, () => (
      <QuestionSettingsSidebar question={question} />
    ))
    .otherwise(() => null);
};

const View = props => {
  const {
    question,
    result,
    rawSeries,
    databases,
    isShowingNewbModal,
    isShowingTimelineSidebar,
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
    questionAlerts,
    user,
    modal,
    modalContext,
    card,
    onCloseModal,
    onOpenModal,
    originalQuestion,
    isShowingChartSettingsSidebar,
    isShowingChartTypeSidebar,
    onCloseChartSettings,
    addField,
    initialChartSetting,
    onReplaceAllVisualizationSettings,
    onOpenChartType,
    visualizationSettings,
    showSidebarTitle,
    isShowingSummarySidebar,
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
  } = props;

  // if we don't have a question at all or no databases then we are initializing, so keep it simple
  if (!question || !databases) {
    return <LoadingAndErrorWrapper className={CS.fullHeight} loading />;
  }

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(question.query());

  const isNewQuestion = !isNative && Lib.sourceTableOrCardId(query) === null;
  const isModel = question.type() === "model";
  const isMetric = question.type() === "metric";

  if ((isModel || isMetric) && queryBuilderMode === "dataset") {
    return (
      <>
        {isModel && <DatasetEditor {...props} />}
        {isMetric && (
          <MetricEditor
            question={question}
            result={result}
            rawSeries={rawSeries}
            reportTimezone={reportTimezone}
            isDirty={isDirty}
            isResultDirty={isResultDirty}
            isRunning={isRunning}
            onChange={updateQuestion}
            onCreate={async question => {
              await onCreate(question);
              setQueryBuilderMode("view");
            }}
            onSave={async question => {
              await onSave(question);
              setQueryBuilderMode("view");
            }}
            onCancel={question => {
              if (question.isSaved()) {
                cancelQuestionChanges();
                runDirtyQuestionQuery();
                setQueryBuilderMode("view");
              } else {
                onChangeLocation("/");
              }
            }}
            onRunQuery={runQuestionQuery}
            onCancelQuery={cancelQuery}
          />
        )}
        <QueryModals
          questionAlerts={questionAlerts}
          user={user}
          onSave={onSave}
          onCreate={onCreate}
          updateQuestion={updateQuestion}
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
    <div className={CS.fullHeight}>
      <QueryBuilderViewRoot
        className={QueryBuilderS.QueryBuilder}
        data-testid="query-builder-root"
      >
        {isHeaderVisible && <ViewHeaderContainer {...props} />}

        <QueryBuilderContentContainer>
          {!isNative && (
            <NotebookContainer
              isOpen={isNotebookContainerOpen}
              updateQuestion={updateQuestion}
              reportTimezone={reportTimezone}
              readOnly={readOnly}
              question={question}
              isDirty={isDirty}
              isRunnable={isRunnable}
              isResultDirty={isResultDirty}
              hasVisualizeButton={hasVisualizeButton}
              runQuestionQuery={runQuestionQuery}
              setQueryBuilderMode={setQueryBuilderMode}
            />
          )}
          <ViewSidebar side="left" isOpen={showLeftSidebar}>
            <ViewLeftSidebarContainer
              question={question}
              result={result}
              isShowingChartSettingsSidebar={isShowingChartSettingsSidebar}
              isShowingChartTypeSidebar={isShowingChartTypeSidebar}
              onCloseChartSettings={onCloseChartSettings}
              addField={addField}
              initialChartSetting={initialChartSetting}
              onReplaceAllVisualizationSettings={
                onReplaceAllVisualizationSettings
              }
              onOpenChartType={onOpenChartType}
              visualizationSettings={visualizationSettings}
              showSidebarTitle={showSidebarTitle}
            />
          </ViewSidebar>
          <ViewMainContainer
            showLeftSidebar={showLeftSidebar}
            showRightSidebar={showRightSidebar}
            {...props}
          />
          <ViewSidebar
            side="right"
            isOpen={showRightSidebar}
            width={rightSidebarWidth}
          >
            <ViewRightSidebarContainer {...props} />
          </ViewSidebar>
        </QueryBuilderContentContainer>
      </QueryBuilderViewRoot>

      {isShowingNewbModal && (
        <SavedQuestionIntroModal
          question={question}
          isShowingNewbModal={isShowingNewbModal}
          onClose={() => closeQbNewbModal()}
        />
      )}

      <QueryModals
        questionAlerts={questionAlerts}
        user={user}
        onSave={onSave}
        onCreate={onCreate}
        updateQuestion={updateQuestion}
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

      <Toaster
        message={t`Would you like to be notified when this question is done loading?`}
        isShown={isShowingToaster}
        onDismiss={onDismissToast}
        onConfirm={onConfirmToast}
        fixed
      />
    </div>
  );
};

const mapDispatchToProps = dispatch => ({
  onSetDatabaseId: id => dispatch(rememberLastUsedDatabase(id)),
  onUnarchive: async question => {
    await dispatch(setArchivedQuestion(question, false));
    await dispatch(Bookmarks.actions.invalidateLists());
  },
  onMove: (question, newCollection) =>
    dispatch(
      Questions.actions.setCollection({ id: question.id() }, newCollection, {
        notify: { undo: false },
      }),
    ),
  onDeletePermanently: id => {
    const deleteAction = Questions.actions.delete({ id });
    dispatch(deletePermanently(deleteAction));
  },
});

export default _.compose(
  ExplicitSize({ refreshMode: "debounceLeading" }),
  connect(null, mapDispatchToProps),
)(View);
