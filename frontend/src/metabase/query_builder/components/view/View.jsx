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
  const query = props.question.query();
  const card = props.question.card();
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
          onUnarchive={() => props.onUnarchive(props.question)}
          onMove={collection => props.onMove(props.question, collection)}
          onDeletePermanently={() => props.onDeletePermanently(card.id)}
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
  if (props.queryBuilderMode === "notebook") {
    // we need to render main only in view mode
    return;
  }

  const queryMode = props.mode && props.mode.queryMode();
  const { isNative } = Lib.queryDisplayInfo(props.question.query());
  const isSidebarOpen = props.showLeftSidebar || props.showRightSidebar;

  return (
    <QueryBuilderMain
      isSidebarOpen={isSidebarOpen}
      data-testid="query-builder-main"
    >
      {isNative ? (
        <ViewNativeQueryEditor {...props} />
      ) : (
        <StyledSyncedParametersList
          parameters={props.parameters}
          setParameterValue={props.setParameterValue}
          commitImmediately
        />
      )}

      <StyledDebouncedFrame enabled={!props.isLiveResizable}>
        <QueryVisualization
          {...props}
          noHeader
          className={CS.spread}
          mode={queryMode}
        />
      </StyledDebouncedFrame>
      <TimeseriesChrome
        question={props.question}
        updateQuestion={props.updateQuestion}
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
}) => {
  if (isShowingChartSettingsSidebar) {
    return (
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
    );
  }

  if (isShowingChartTypeSidebar) {
    return <ChartTypeSidebar question={question} result={result} />;
  }

  return null;
};

const ViewNativeQueryEditor = props => {
  const legacyQuery = props.question.legacyQuery();

  // Normally, when users open native models,
  // they open an ad-hoc GUI question using the model as a data source
  // (using the `/dataset` endpoint instead of the `/card/:id/query`)
  // However, users without data permission open a real model as they can't use the `/dataset` endpoint
  // So the model is opened as an underlying native question and the query editor becomes visible
  // This check makes it hide the editor in this particular case
  // More details: https://github.com/metabase/metabase/pull/20161
  const { isEditable } = Lib.queryDisplayInfo(props.question.query());
  if (props.question.type() === "model" && !isEditable) {
    return null;
  }

  return (
    <NativeQueryEditorContainer>
      <NativeQueryEditor
        {...props}
        query={legacyQuery}
        viewHeight={props.height}
        isOpen={legacyQuery.isEmpty() || props.isDirty}
        isInitiallyOpen={props.isNativeEditorOpen}
        datasetQuery={props.card && props.card.dataset_query}
        setParameterValueToDefault={props.setParameterValueToDefault}
        onSetDatabaseId={props.onSetDatabaseId}
      />
    </NativeQueryEditorContainer>
  );
};

const ViewRightSidebarContainer = props => {
  const { isNative } = Lib.queryDisplayInfo(props.question.query());

  return !isNative ? (
    <StructuredQueryRightSidebar {...props} />
  ) : (
    <NativeQueryRightSidebar {...props} />
  );
};

const StructuredQueryRightSidebar = props => {
  const isSaved = props.question.isSaved();

  if (props.isShowingSummarySidebar) {
    const query = props.question.query();
    return (
      <SummarizeSidebar
        query={query}
        onQueryChange={nextQuery => {
          const datesetQuery = Lib.toLegacyQuery(nextQuery);
          const nextQuestion = props.question.setDatasetQuery(datesetQuery);
          props.updateQuestion(nextQuestion.setDefaultDisplay(), {
            run: true,
          });
        }}
        onClose={props.onCloseSummary}
      />
    );
  }

  if (props.isShowingTimelineSidebar) {
    return (
      <TimelineSidebar
        question={props.question}
        timelines={props.timelines}
        visibleTimelineEventIds={props.visibleTimelineEventIds}
        selectedTimelineEventIds={props.selectedTimelineEventIds}
        xDomain={props.xDomain}
        onShowTimelineEvents={props.showTimelineEvents}
        onHideTimelineEvents={props.hideTimelineEvents}
        onSelectTimelineEvents={props.selectTimelineEvents}
        onDeselectTimelineEvents={props.deselectTimelineEvents}
        onOpenModal={props.onOpenModal}
        onClose={props.onCloseTimelines}
      />
    );
  }

  if (isSaved && props.isShowingQuestionInfoSidebar) {
    return (
      <QuestionInfoSidebar
        question={props.question}
        onSave={props.onSave}
        onClose={props.onCloseQuestionInfo}
      />
    );
  }

  if (isSaved && props.isShowingQuestionSettingsSidebar) {
    return <QuestionSettingsSidebar question={props.question} />;
  }

  return null;
};

const NativeQueryRightSidebar = props => {
  if (props.isShowingTemplateTagsEditor) {
    return (
      <TagEditorSidebar
        {...props}
        query={props.question.legacyQuery()}
        onClose={props.toggleTemplateTagsEditor}
      />
    );
  }

  if (props.isShowingDataReference) {
    return <DataReference {...props} onClose={props.toggleDataReference} />;
  }

  if (props.isShowingSnippetSidebar) {
    return <SnippetSidebar {...props} onClose={props.toggleSnippetSidebar} />;
  }

  if (props.isShowingTimelineSidebar) {
    return (
      <TimelineSidebar
        {...props}
        onShowTimelineEvent={props.showTimelineEvent}
        onShowTimelineEvents={props.showTimelineEvents}
        onHideTimelineEvents={props.hideTimelineEvents}
        onSelectTimelineEvents={props.selectTimelineEvents}
        onDeselectTimelineEvents={props.deselectTimelineEvents}
        onClose={props.onCloseTimelines}
      />
    );
  }

  if (props.isShowingQuestionInfoSidebar) {
    return (
      <QuestionInfoSidebar
        question={props.question}
        onSave={props.onSave}
        onClose={props.onCloseQuestionInfo}
      />
    );
  }

  if (props.isShowingQuestionSettingsSidebar) {
    return <QuestionSettingsSidebar question={props.question} />;
  }

  return null;
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
