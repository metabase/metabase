/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Toaster from "metabase/components/Toaster";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { rememberLastUsedDatabase } from "metabase/query_builder/actions";
import { SIDEBAR_SIZES } from "metabase/query_builder/constants";
import { TimeseriesChrome } from "metabase/querying";
import { Transition } from "metabase/ui";
import * as Lib from "metabase-lib";

import DatasetEditor from "../DatasetEditor";
import NativeQueryEditor from "../NativeQueryEditor";
import QueryModals from "../QueryModals";
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
import ViewFooter from "./ViewFooter";
import ViewSidebar from "./ViewSidebar";
import ChartSettingsSidebar from "./sidebars/ChartSettingsSidebar";
import ChartTypeSidebar from "./sidebars/ChartTypeSidebar";
import { QuestionInfoSidebar } from "./sidebars/QuestionInfoSidebar";
import { SummarizeSidebar } from "./sidebars/SummarizeSidebar";
import TimelineSidebar from "./sidebars/TimelineSidebar";

const fadeIn = {
  in: { opacity: 1 },
  out: { opacity: 0 },
  transitionProperty: "opacity",
};

class View extends Component {
  getLeftSidebar = () => {
    const {
      isShowingChartSettingsSidebar,
      isShowingChartTypeSidebar,
      onCloseChartSettings,
      onCloseChartType,
    } = this.props;

    if (isShowingChartSettingsSidebar) {
      const {
        question,
        result,
        addField,
        initialChartSetting,
        onReplaceAllVisualizationSettings,
        onOpenChartType,
        visualizationSettings,
        showSidebarTitle,
      } = this.props;
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
      return <ChartTypeSidebar {...this.props} onClose={onCloseChartType} />;
    }

    return null;
  };

  getRightSidebarForStructuredQuery = () => {
    const {
      question,
      timelines,
      isShowingSummarySidebar,
      isShowingTimelineSidebar,
      isShowingQuestionInfoSidebar,
      updateQuestion,
      visibleTimelineEventIds,
      selectedTimelineEventIds,
      xDomain,
      showTimelineEvents,
      hideTimelineEvents,
      selectTimelineEvents,
      deselectTimelineEvents,
      onOpenModal,
      onCloseSummary,
      onCloseTimelines,
      onSave,
    } = this.props;

    const isSaved = question.isSaved();

    if (isShowingSummarySidebar) {
      const query = question.query();
      return (
        <SummarizeSidebar
          query={query}
          onQueryChange={nextQuery => {
            const datesetQuery = Lib.toLegacyQuery(nextQuery);
            const nextQuestion = question.setDatasetQuery(datesetQuery);
            updateQuestion(nextQuestion.setDefaultDisplay(), { run: true });
          }}
          onClose={onCloseSummary}
        />
      );
    }

    if (isShowingTimelineSidebar) {
      return (
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
      );
    }

    if (isSaved && isShowingQuestionInfoSidebar) {
      return <QuestionInfoSidebar question={question} onSave={onSave} />;
    }

    return null;
  };

  getRightSidebarForNativeQuery = () => {
    const {
      isShowingTemplateTagsEditor,
      isShowingDataReference,
      isShowingSnippetSidebar,
      isShowingTimelineSidebar,
      isShowingQuestionInfoSidebar,
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
      question,
    } = this.props;

    if (isShowingTemplateTagsEditor) {
      return (
        <TagEditorSidebar
          {...this.props}
          query={question.legacyQuery()}
          onClose={toggleTemplateTagsEditor}
        />
      );
    }

    if (isShowingDataReference) {
      return <DataReference {...this.props} onClose={toggleDataReference} />;
    }

    if (isShowingSnippetSidebar) {
      return <SnippetSidebar {...this.props} onClose={toggleSnippetSidebar} />;
    }

    if (isShowingTimelineSidebar) {
      return (
        <TimelineSidebar
          {...this.props}
          onShowTimelineEvent={showTimelineEvent}
          onShowTimelineEvents={showTimelineEvents}
          onHideTimelineEvents={hideTimelineEvents}
          onSelectTimelineEvents={selectTimelineEvents}
          onDeselectTimelineEvents={deselectTimelineEvents}
          onClose={onCloseTimelines}
        />
      );
    }

    if (isShowingQuestionInfoSidebar) {
      return <QuestionInfoSidebar question={question} onSave={onSave} />;
    }

    return null;
  };

  getRightSidebar = () => {
    const { question } = this.props;
    const { isNative } = Lib.queryDisplayInfo(question.query());

    return !isNative
      ? this.getRightSidebarForStructuredQuery()
      : this.getRightSidebarForNativeQuery();
  };

  renderHeader = () => {
    const { question } = this.props;
    const query = question.query();
    const { isNative } = Lib.queryDisplayInfo(query);

    const isNewQuestion = !isNative && Lib.sourceTableOrCardId(query) === null;

    return (
      <QueryBuilderViewHeaderContainer>
        <BorderedViewTitleHeader
          {...this.props}
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

  renderNativeQueryEditor = () => {
    const {
      question,
      card,
      height,
      isDirty,
      isNativeEditorOpen,
      setParameterValueToDefault,
      onSetDatabaseId,
    } = this.props;

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
          {...this.props}
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

  renderMain = ({ leftSidebar, rightSidebar }) => {
    const {
      question,
      mode,
      parameters,
      isLiveResizable,
      setParameterValue,
      queryBuilderMode,
    } = this.props;

    if (queryBuilderMode === "notebook") {
      // we need to render main only in view mode
      return;
    }

    const queryMode = mode && mode.queryMode();
    const { isNative } = Lib.queryDisplayInfo(question.query());
    const isSidebarOpen = leftSidebar || rightSidebar;

    return (
      <QueryBuilderMain
        isSidebarOpen={isSidebarOpen}
        data-testid="query-builder-main"
      >
        {isNative ? (
          this.renderNativeQueryEditor()
        ) : (
          <StyledSyncedParametersList
            parameters={parameters}
            setParameterValue={setParameterValue}
            commitImmediately
          />
        )}

        <StyledDebouncedFrame enabled={!isLiveResizable}>
          <QueryVisualization
            {...this.props}
            noHeader
            className={CS.spread}
            mode={queryMode}
          />
        </StyledDebouncedFrame>
        <TimeseriesChrome
          question={this.props.question}
          updateQuestion={this.props.updateQuestion}
          className={CS.flexNoShrink}
        />
        <ViewFooter {...this.props} className={CS.flexNoShrink} />
      </QueryBuilderMain>
    );
  };

  render() {
    const {
      question,
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
      isRunnable,
      isResultDirty,
      hasVisualizeButton,
      runQuestionQuery,
      setQueryBuilderMode,
    } = this.props;

    // if we don't have a question at all or no databases then we are initializing, so keep it simple
    if (!question || !databases) {
      return <LoadingAndErrorWrapper className={CS.fullHeight} loading />;
    }

    const query = question.query();
    const { isNative } = Lib.queryDisplayInfo(question.query());

    const isNewQuestion = !isNative && Lib.sourceTableOrCardId(query) === null;
    const isModel = question.type() === "model";

    if (isModel && queryBuilderMode === "dataset") {
      return (
        <>
          <DatasetEditor {...this.props} />
          <QueryModals
            questionAlerts={this.props.questionAlerts}
            user={this.props.user}
            onSave={this.props.onSave}
            onCreate={this.props.onCreate}
            updateQuestion={this.props.updateQuestion}
            modal={this.props.modal}
            modalContext={this.props.modalContext}
            card={this.props.card}
            question={this.props.question}
            onCloseModal={this.props.onCloseModal}
            onOpenModal={this.props.onOpenModal}
            setQueryBuilderMode={this.props.setQueryBuilderMode}
            originalQuestion={this.props.originalQuestion}
            onChangeLocation={this.props.onChangeLocation}
          />
        </>
      );
    }

    const isNotebookContainerOpen =
      isNewQuestion || queryBuilderMode === "notebook";

    const leftSidebar = this.getLeftSidebar();
    const rightSidebar = this.getRightSidebar();
    const rightSidebarWidth = isShowingTimelineSidebar
      ? SIDEBAR_SIZES.TIMELINE
      : SIDEBAR_SIZES.NORMAL;

    return (
      <div className={CS.fullHeight}>
        <QueryBuilderViewRoot
          className={QueryBuilderS.QueryBuilder}
          data-testid="query-builder-root"
        >
          {isHeaderVisible && this.renderHeader()}
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
            <ViewSidebar side="left" isOpen={!!leftSidebar}>
              {leftSidebar}
            </ViewSidebar>
            {this.renderMain({ leftSidebar, rightSidebar })}
            <ViewSidebar
              side="right"
              isOpen={!!rightSidebar}
              width={rightSidebarWidth}
            >
              {rightSidebar}
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
          questionAlerts={this.props.questionAlerts}
          user={this.props.user}
          onSave={this.props.onSave}
          onCreate={this.props.onCreate}
          updateQuestion={this.props.updateQuestion}
          modal={this.props.modal}
          modalContext={this.props.modalContext}
          card={this.props.card}
          question={this.props.question}
          onCloseModal={this.props.onCloseModal}
          onOpenModal={this.props.onOpenModal}
          setQueryBuilderMode={this.props.setQueryBuilderMode}
          originalQuestion={this.props.originalQuestion}
          onChangeLocation={this.props.onChangeLocation}
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
  }
}

const mapDispatchToProps = dispatch => ({
  onSetDatabaseId: id => dispatch(rememberLastUsedDatabase(id)),
});

export default _.compose(
  ExplicitSize({ refreshMode: "debounceLeading" }),
  connect(null, mapDispatchToProps),
)(View);
