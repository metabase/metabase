/* eslint-disable react/prop-types */
import { Component } from "react";
import { Motion, spring } from "react-motion";
import _ from "underscore";
import { t } from "ttag";

import ExplicitSize from "metabase/components/ExplicitSize";
import QueryValidationError from "metabase/query_builder/components/QueryValidationError";
import { SIDEBAR_SIZES } from "metabase/query_builder/constants";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Toaster from "metabase/components/Toaster";
import { TimeseriesChrome } from "metabase/querying";

import * as Lib from "metabase-lib";
import NativeQuery from "metabase-lib/queries/NativeQuery";

import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import DatasetEditor from "../DatasetEditor";
import NativeQueryEditor from "../NativeQueryEditor";
import QueryVisualization from "../QueryVisualization";
import DataReference from "../dataref/DataReference";
import { TagEditorSidebar } from "../template_tags/TagEditorSidebar";
import { SnippetSidebar } from "../template_tags/SnippetSidebar";
import SavedQuestionIntroModal from "../SavedQuestionIntroModal";

import QueryModals from "../QueryModals";
import ChartSettingsSidebar from "./sidebars/ChartSettingsSidebar";
import ChartTypeSidebar from "./sidebars/ChartTypeSidebar";
import { SummarizeSidebar } from "./sidebars/SummarizeSidebar";
import { QuestionInfoSidebar } from "./sidebars/QuestionInfoSidebar";

import TimelineSidebar from "./sidebars/TimelineSidebar";
import NewQuestionHeader from "./NewQuestionHeader";
import ViewFooter from "./ViewFooter";
import ViewSidebar from "./ViewSidebar";
import NewQuestionView from "./View/NewQuestionView";

import QueryViewNotebook from "./View/QueryViewNotebook";
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

class View extends Component {
  getLeftSidebar = () => {
    const {
      isShowingChartSettingsSidebar,
      isShowingChartTypeSidebar,
      onCloseChartSettings,
      onCloseChartType,
    } = this.props;

    if (isShowingChartSettingsSidebar) {
      return (
        <ChartSettingsSidebar {...this.props} onClose={onCloseChartSettings} />
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
      const query = question._getMLv2Query();
      const legacyQuery = question.legacyQuery();
      return (
        <SummarizeSidebar
          query={query}
          legacyQuery={legacyQuery}
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
        <TagEditorSidebar {...this.props} onClose={toggleTemplateTagsEditor} />
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
    const isStructured = question.isStructured();
    return isStructured
      ? this.getRightSidebarForStructuredQuery()
      : this.getRightSidebarForNativeQuery();
  };

  renderHeader = () => {
    const { query } = this.props;
    const isStructured = query instanceof StructuredQuery;

    const isNewQuestion =
      isStructured && !query.sourceTableId() && !query.sourceQuery();

    return (
      <Motion
        defaultStyle={isNewQuestion ? { opacity: 0 } : { opacity: 1 }}
        style={isNewQuestion ? { opacity: spring(0) } : { opacity: spring(1) }}
      >
        {({ opacity }) => (
          <QueryBuilderViewHeaderContainer>
            <BorderedViewTitleHeader {...this.props} style={{ opacity }} />
            {opacity < 1 && (
              <NewQuestionHeader
                className="spread"
                style={{ opacity: 1 - opacity }}
              />
            )}
          </QueryBuilderViewHeaderContainer>
        )}
      </Motion>
    );
  };

  renderNativeQueryEditor = () => {
    const { question, query, card, height, isDirty, isNativeEditorOpen } =
      this.props;

    // Normally, when users open native models,
    // they open an ad-hoc GUI question using the model as a data source
    // (using the `/dataset` endpoint instead of the `/card/:id/query`)
    // However, users without data permission open a real model as they can't use the `/dataset` endpoint
    // So the model is opened as an underlying native question and the query editor becomes visible
    // This check makes it hide the editor in this particular case
    // More details: https://github.com/metabase/metabase/pull/20161
    if (question.isDataset() && !question.isQueryEditable()) {
      return null;
    }

    return (
      <NativeQueryEditorContainer>
        <NativeQueryEditor
          {...this.props}
          viewHeight={height}
          isOpen={query.isEmpty() || isDirty}
          isInitiallyOpen={isNativeEditorOpen}
          datasetQuery={card && card.dataset_query}
        />
      </NativeQueryEditorContainer>
    );
  };

  renderMain = ({ leftSidebar, rightSidebar }) => {
    const { query, mode, parameters, isLiveResizable, setParameterValue } =
      this.props;

    const queryMode = mode && mode.queryMode();
    const isNative = query instanceof NativeQuery;
    const validationError = _.first(query.validate?.());
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

        {validationError ? (
          <QueryValidationError error={validationError} />
        ) : (
          <StyledDebouncedFrame enabled={!isLiveResizable}>
            <QueryVisualization
              {...this.props}
              noHeader
              className="spread"
              mode={queryMode}
            />
          </StyledDebouncedFrame>
        )}
        <TimeseriesChrome {...this.props} className="flex-no-shrink" />
        <ViewFooter {...this.props} className="flex-no-shrink" />
      </QueryBuilderMain>
    );
  };

  render() {
    const {
      question,
      query,
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
    } = this.props;

    // if we don't have a question at all or no databases then we are initializing, so keep it simple
    if (!question || !databases) {
      return <LoadingAndErrorWrapper className="full-height" loading />;
    }

    const isStructured = query instanceof StructuredQuery;

    const isNewQuestion =
      isStructured && !query.sourceTableId() && !query.sourceQuery();

    if (isNewQuestion && queryBuilderMode === "view") {
      return (
        <NewQuestionView
          query={query}
          updateQuestion={updateQuestion}
          className="full-height"
        />
      );
    }

    if (question.isDataset() && queryBuilderMode === "dataset") {
      return (
        <>
          <DatasetEditor {...this.props} />
          <QueryModals {...this.props} />
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
      <div className="full-height">
        <QueryBuilderViewRoot className="QueryBuilder">
          {isHeaderVisible && this.renderHeader()}
          <QueryBuilderContentContainer>
            {isStructured && (
              <QueryViewNotebook
                isNotebookContainerOpen={isNotebookContainerOpen}
                {...this.props}
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
            onClose={() => closeQbNewbModal()}
          />
        )}

        <QueryModals {...this.props} />

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

export default ExplicitSize({ refreshMode: "debounceLeading" })(View);
