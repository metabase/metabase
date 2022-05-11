/* eslint-disable react/prop-types */
import React from "react";
import { Motion, spring } from "react-motion";
import _ from "underscore";
import { t } from "ttag";

import ExplicitSize from "metabase/components/ExplicitSize";
import Popover from "metabase/components/Popover";
import QueryValidationError from "metabase/query_builder/components/QueryValidationError";
import { SIDEBAR_SIZES } from "metabase/query_builder/constants";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Toaster from "metabase/components/Toaster";

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import AggregationPopover from "../AggregationPopover";
import BreakoutPopover from "../BreakoutPopover";
import DatasetEditor from "../DatasetEditor";
import NativeQueryEditor from "../NativeQueryEditor";
import QueryVisualization from "../QueryVisualization";
import DataReference from "../dataref/DataReference";
import TagEditorSidebar from "../template_tags/TagEditorSidebar";
import SnippetSidebar from "../template_tags/SnippetSidebar";
import SavedQuestionIntroModal from "../SavedQuestionIntroModal";
import QueryModals from "../QueryModals";

import ChartSettingsSidebar from "./sidebars/ChartSettingsSidebar";
import ChartTypeSidebar from "./sidebars/ChartTypeSidebar";
import SummarizeSidebar from "./sidebars/SummarizeSidebar/SummarizeSidebar";
import FilterSidebar from "./sidebars/FilterSidebar";
import QuestionDetailsSidebar from "./sidebars/QuestionDetailsSidebar";
import TimelineSidebar from "./sidebars/TimelineSidebar";

import { ViewSubHeader } from "./ViewHeader";
import NewQuestionHeader from "./NewQuestionHeader";
import ViewFooter from "./ViewFooter";
import ViewSidebar from "./ViewSidebar";
import NewQuestionView from "./View/NewQuestionView";
import QueryViewNotebook from "./View/QueryViewNotebook";

import {
  QueryBuilderViewRoot,
  QueryBuilderContentContainer,
  QueryBuilderMain,
  QueryBuilderViewHeaderContainer,
  BorderedViewTitleHeader,
  NativeQueryEditorContainer,
  StyledDebouncedFrame,
  StyledSyncedParametersList,
} from "./View.styled";

const DEFAULT_POPOVER_STATE = {
  aggregationIndex: null,
  aggregationPopoverTarget: null,
  breakoutIndex: null,
  breakoutPopoverTarget: null,
};

class View extends React.Component {
  state = {
    ...DEFAULT_POPOVER_STATE,
  };

  handleAddSeries = e => {
    this.setState({
      ...DEFAULT_POPOVER_STATE,
      aggregationPopoverTarget: e.target,
    });
  };

  handleEditSeries = (e, index) => {
    this.setState({
      ...DEFAULT_POPOVER_STATE,
      aggregationPopoverTarget: e.target,
      aggregationIndex: index,
    });
  };

  handleRemoveSeries = (e, index) => {
    const { query } = this.props;
    query.removeAggregation(index).update(null, { run: true });
  };

  handleEditBreakout = (e, index) => {
    this.setState({
      ...DEFAULT_POPOVER_STATE,
      breakoutPopoverTarget: e.target,
      breakoutIndex: index,
    });
  };

  handleClosePopover = () => {
    this.setState({
      ...DEFAULT_POPOVER_STATE,
    });
  };

  onChangeAggregation = aggregation => {
    const { query } = this.props;
    const { aggregationIndex } = this.state;
    if (aggregationIndex != null) {
      query
        .updateAggregation(aggregationIndex, aggregation)
        .update(null, { run: true });
    } else {
      query.aggregate(aggregation).update(null, { run: true });
    }
    this.handleClosePopover();
  };

  onChangeBreakout = breakout => {
    const { query } = this.props;
    const { breakoutIndex } = this.state;
    if (breakoutIndex != null) {
      query.updateBreakout(breakoutIndex, breakout).update(null, { run: true });
    } else {
      query.breakout(breakout).update(null, { run: true });
    }
    this.handleClosePopover();
  };

  getLeftSidebar = () => {
    const {
      question,
      isShowingChartSettingsSidebar,
      isShowingChartTypeSidebar,
      isShowingQuestionDetailsSidebar,
      onOpenModal,
      onCloseChartSettings,
      onCloseChartType,
      isBookmarked,
      toggleBookmark,
      persistDataset,
      unpersistDataset,
    } = this.props;

    if (isShowingChartSettingsSidebar) {
      return (
        <ChartSettingsSidebar {...this.props} onClose={onCloseChartSettings} />
      );
    }

    if (isShowingChartTypeSidebar) {
      return <ChartTypeSidebar {...this.props} onClose={onCloseChartType} />;
    }

    if (isShowingQuestionDetailsSidebar) {
      return (
        <QuestionDetailsSidebar
          question={question}
          onOpenModal={onOpenModal}
          isBookmarked={isBookmarked}
          toggleBookmark={toggleBookmark}
          persistDataset={persistDataset}
          unpersistDataset={unpersistDataset}
        />
      );
    }

    return null;
  };

  getRightSidebarForStructuredQuery = () => {
    const {
      question,
      timelines,
      isResultDirty,
      isShowingSummarySidebar,
      isShowingFilterSidebar,
      isShowingTimelineSidebar,
      runQuestionQuery,
      visibleTimelineIds,
      selectedTimelineEventIds,
      xDomain,
      showTimelines,
      hideTimelines,
      selectTimelineEvents,
      deselectTimelineEvents,
      onOpenModal,
      onCloseSummary,
      onCloseFilter,
      onCloseTimelines,
    } = this.props;

    if (isShowingSummarySidebar) {
      return (
        <SummarizeSidebar
          question={question}
          onClose={onCloseSummary}
          isResultDirty={isResultDirty}
          runQuestionQuery={runQuestionQuery}
        />
      );
    }

    if (isShowingFilterSidebar) {
      return <FilterSidebar question={question} onClose={onCloseFilter} />;
    }

    if (isShowingTimelineSidebar) {
      return (
        <TimelineSidebar
          question={question}
          timelines={timelines}
          visibleTimelineIds={visibleTimelineIds}
          selectedTimelineEventIds={selectedTimelineEventIds}
          xDomain={xDomain}
          onShowTimelines={showTimelines}
          onHideTimelines={hideTimelines}
          onSelectTimelineEvents={selectTimelineEvents}
          onDeselectTimelineEvents={deselectTimelineEvents}
          onOpenModal={onOpenModal}
          onClose={onCloseTimelines}
        />
      );
    }

    return null;
  };

  getRightSidebarForNativeQuery = () => {
    const {
      isShowingTemplateTagsEditor,
      isShowingDataReference,
      isShowingSnippetSidebar,
      isShowingTimelineSidebar,
      toggleTemplateTagsEditor,
      toggleDataReference,
      toggleSnippetSidebar,
      showTimelines,
      hideTimelines,
      selectTimelineEvents,
      deselectTimelineEvents,
      onCloseTimelines,
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
          onShowTimelines={showTimelines}
          onHideTimelines={hideTimelines}
          onSelectTimelineEvents={selectTimelineEvents}
          onDeselectTimelineEvents={deselectTimelineEvents}
          onClose={onCloseTimelines}
        />
      );
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
    const { question, query, card, height, isDirty } = this.props;

    // Normally, when users open native models,
    // they open an ad-hoc GUI question using the model as a data source
    // (using the `/dataset` endpoint instead of the `/card/:id/query`)
    // However, users without data permission open a real model as they can't use the `/dataset` endpoint
    // So the model is opened as an underlying native question and the query editor becomes visible
    // This check makes it hide the editor in this particular case
    // More details: https://github.com/metabase/metabase/pull/20161
    if (question.isDataset() && !query.isEditable()) {
      return null;
    }

    return (
      <NativeQueryEditorContainer>
        <NativeQueryEditor
          {...this.props}
          viewHeight={height}
          isOpen={!card.dataset_query.native.query || isDirty}
          datasetQuery={card && card.dataset_query}
        />
      </NativeQueryEditorContainer>
    );
  };

  renderMain = ({ leftSidebar, rightSidebar }) => {
    const {
      query,
      mode,
      parameters,
      isLiveResizable,
      isPreviewable,
      isPreviewing,
      setParameterValue,
      setIsPreviewing,
    } = this.props;

    const queryMode = mode && mode.queryMode();
    const ModeFooter = queryMode && queryMode.ModeFooter;
    const isStructured = query instanceof StructuredQuery;
    const isNative = query instanceof NativeQuery;

    const validationError = _.first(query.validate?.());

    const topQuery = isStructured && query.topLevelQuery();

    // only allow editing of series for structured queries
    const onAddSeries = topQuery ? this.handleAddSeries : null;
    const onEditSeries = topQuery ? this.handleEditSeries : null;
    const onRemoveSeries =
      topQuery && topQuery.hasAggregations() ? this.handleRemoveSeries : null;
    const onEditBreakout =
      topQuery && topQuery.hasBreakouts() ? this.handleEditBreakout : null;

    const isSidebarOpen = leftSidebar || rightSidebar;

    return (
      <QueryBuilderMain isSidebarOpen={isSidebarOpen}>
        {isNative ? (
          this.renderNativeQueryEditor()
        ) : (
          <StyledSyncedParametersList
            parameters={parameters}
            setParameterValue={setParameterValue}
            commitImmediately
          />
        )}

        <ViewSubHeader
          isPreviewable={isPreviewable}
          isPreviewing={isPreviewing}
          setIsPreviewing={setIsPreviewing}
        />

        {validationError ? (
          <QueryValidationError error={validationError} />
        ) : (
          <StyledDebouncedFrame enabled={!isLiveResizable}>
            <QueryVisualization
              {...this.props}
              noHeader
              className="spread"
              onAddSeries={onAddSeries}
              onEditSeries={onEditSeries}
              onRemoveSeries={onRemoveSeries}
              onEditBreakout={onEditBreakout}
              mode={queryMode}
            />
          </StyledDebouncedFrame>
        )}

        {ModeFooter && (
          <ModeFooter {...this.props} className="flex-no-shrink" />
        )}

        <ViewFooter {...this.props} className="flex-no-shrink" />
      </QueryBuilderMain>
    );
  };

  renderAggregationPopover = () => {
    const { query } = this.props;
    const { aggregationPopoverTarget, aggregationIndex } = this.state;
    return (
      <Popover
        isOpen={!!aggregationPopoverTarget}
        target={aggregationPopoverTarget}
        onClose={this.handleClosePopover}
      >
        <AggregationPopover
          query={query}
          aggregation={
            aggregationIndex >= 0 ? query.aggregations()[aggregationIndex] : 0
          }
          onChangeAggregation={this.onChangeAggregation}
          onClose={this.handleClosePopover}
        />
      </Popover>
    );
  };

  renderBreakoutPopover = () => {
    const { query } = this.props;
    const { breakoutPopoverTarget, breakoutIndex } = this.state;
    return (
      <Popover
        isOpen={!!breakoutPopoverTarget}
        onClose={this.handleClosePopover}
        target={breakoutPopoverTarget}
      >
        <BreakoutPopover
          query={query}
          breakout={breakoutIndex >= 0 ? query.breakouts()[breakoutIndex] : 0}
          onChangeBreakout={this.onChangeBreakout}
          onClose={this.handleClosePopover}
        />
      </Popover>
    );
  };

  render() {
    const {
      question,
      query,
      card,
      databases,
      isShowingNewbModal,
      isShowingTimelineSidebar,
      queryBuilderMode,
      closeQbNewbModal,
      onDismissToast,
      onConfirmToast,
      isShowingToaster,
    } = this.props;

    // if we don't have a card at all or no databases then we are initializing, so keep it simple
    if (!card || !databases) {
      return <LoadingAndErrorWrapper className="full-height" loading />;
    }

    const isStructured = query instanceof StructuredQuery;

    const isNewQuestion =
      isStructured && !query.sourceTableId() && !query.sourceQuery();

    if (isNewQuestion && queryBuilderMode === "view") {
      return <NewQuestionView query={query} className="full-height" />;
    }

    if (card.dataset && queryBuilderMode === "dataset") {
      return <DatasetEditor {...this.props} />;
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
          {this.renderHeader()}
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

        {isStructured && this.renderAggregationPopover()}
        {isStructured && this.renderBreakoutPopover()}
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
