/* eslint-disable react/prop-types */
import React from "react";
import { Motion, spring } from "react-motion";
import cx from "classnames";

import ExplicitSize from "metabase/components/ExplicitSize";
import Popover from "metabase/components/Popover";
import DebouncedFrame from "metabase/components/DebouncedFrame";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";

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

import { ViewTitleHeader, ViewSubHeader } from "./ViewHeader";
import NewQuestionHeader from "./NewQuestionHeader";
import ViewFooter from "./ViewFooter";
import ViewSidebar from "./ViewSidebar";
import NewQuestionView from "./View/NewQuestionView";
import QueryViewNotebook from "./View/QueryViewNotebook";

const DEFAULT_POPOVER_STATE = {
  aggregationIndex: null,
  aggregationPopoverTarget: null,
  breakoutIndex: null,
  breakoutPopoverTarget: null,
};

@ExplicitSize()
export default class View extends React.Component {
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
        <QuestionDetailsSidebar question={question} onOpenModal={onOpenModal} />
      );
    }

    return null;
  };

  getRightSidebarForStructuredQuery = () => {
    const {
      question,
      isResultDirty,
      isShowingSummarySidebar,
      isShowingFilterSidebar,
      runQuestionQuery,
      onCloseSummary,
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
      return (
        <FilterSidebar question={question} onClose={this.props.onCloseFilter} />
      );
    }

    return null;
  };

  getRightSidebarForNativeQuery = () => {
    const {
      isShowingTemplateTagsEditor,
      isShowingDataReference,
      isShowingSnippetSidebar,
      toggleTemplateTagsEditor,
      toggleDataReference,
      toggleSnippetSidebar,
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
          <div className="flex-no-shrink z3 bg-white relative">
            <ViewTitleHeader
              {...this.props}
              style={{ opacity }}
              py={1}
              className="border-bottom"
            />
            {opacity < 1 && (
              <NewQuestionHeader
                className="spread"
                style={{ opacity: 1 - opacity }}
              />
            )}
          </div>
        )}
      </Motion>
    );
  };

  render() {
    const {
      query,
      card,
      isDirty,
      isLiveResizable,
      databases,
      isShowingNewbModal,
      queryBuilderMode,
      mode,
      fitClassNames,
      height,
    } = this.props;
    const {
      aggregationIndex,
      aggregationPopoverTarget,
      breakoutIndex,
      breakoutPopoverTarget,
    } = this.state;

    // if we don't have a card at all or no databases then we are initializing, so keep it simple
    if (!card || !databases) {
      return <LoadingAndErrorWrapper className={fitClassNames} loading />;
    }
    const queryMode = mode && mode.queryMode();
    const ModeFooter = queryMode && queryMode.ModeFooter;
    const isStructured = query instanceof StructuredQuery;
    const isNative = query instanceof NativeQuery;

    const isNewQuestion =
      isStructured && !query.sourceTableId() && !query.sourceQuery();

    if (isNewQuestion && queryBuilderMode === "view") {
      return <NewQuestionView query={query} fitClassNames={fitClassNames} />;
    }

    if (card.dataset && queryBuilderMode === "dataset") {
      return <DatasetEditor {...this.props} />;
    }

    const topQuery = isStructured && query.topLevelQuery();

    // only allow editing of series for structured queries
    const onAddSeries = topQuery ? this.handleAddSeries : null;
    const onEditSeries = topQuery ? this.handleEditSeries : null;
    const onRemoveSeries =
      topQuery && topQuery.hasAggregations() ? this.handleRemoveSeries : null;
    const onEditBreakout =
      topQuery && topQuery.hasBreakouts() ? this.handleEditBreakout : null;

    const leftSidebar = this.getLeftSidebar();
    const rightSidebar = this.getRightSidebar();
    const isSidebarOpen = leftSidebar || rightSidebar;

    const isNotebookContainerOpen =
      isNewQuestion || queryBuilderMode === "notebook";

    return (
      <div className={fitClassNames}>
        <div className={cx("QueryBuilder flex flex-column bg-white spread")}>
          {this.renderHeader()}

          <div className="flex flex-full relative">
            {query instanceof StructuredQuery && (
              <QueryViewNotebook
                isNotebookContainerOpen={isNotebookContainerOpen}
                {...this.props}
              />
            )}

            <ViewSidebar side="left" isOpen={!!leftSidebar}>
              {leftSidebar}
            </ViewSidebar>

            <div
              className={cx("flex-full flex flex-column flex-basis-none", {
                "hide sm-show": isSidebarOpen,
              })}
            >
              {isNative ? (
                <div className="z2 hide sm-show border-bottom mb2">
                  <NativeQueryEditor
                    {...this.props}
                    viewHeight={height}
                    isOpen={!card.dataset_query.native.query || isDirty}
                    datasetQuery={card && card.dataset_query}
                  />
                </div>
              ) : (
                <SyncedParametersList
                  className="mt2 ml3"
                  parameters={this.props.parameters}
                  setParameterValue={this.props.setParameterValue}
                  commitImmediately
                />
              )}

              <ViewSubHeader {...this.props} />

              <DebouncedFrame
                className="flex-full"
                style={{ flexGrow: 1 }}
                enabled={!isLiveResizable}
              >
                <QueryVisualization
                  {...this.props}
                  onAddSeries={onAddSeries}
                  onEditSeries={onEditSeries}
                  onRemoveSeries={onRemoveSeries}
                  onEditBreakout={onEditBreakout}
                  noHeader
                  className="spread"
                />
              </DebouncedFrame>

              {ModeFooter && (
                <ModeFooter {...this.props} className="flex-no-shrink" />
              )}

              <ViewFooter {...this.props} className="flex-no-shrink" />
            </div>

            <ViewSidebar side="right" isOpen={!!rightSidebar}>
              {rightSidebar}
            </ViewSidebar>
          </div>
        </div>

        {isShowingNewbModal && (
          <SavedQuestionIntroModal
            question={this.props.question}
            onClose={() => this.props.closeQbNewbModal()}
          />
        )}

        <QueryModals {...this.props} />

        {isStructured && (
          <Popover
            isOpen={!!aggregationPopoverTarget}
            target={aggregationPopoverTarget}
            onClose={this.handleClosePopover}
          >
            <AggregationPopover
              query={query}
              aggregation={
                aggregationIndex >= 0
                  ? query.aggregations()[aggregationIndex]
                  : 0
              }
              onChangeAggregation={this.onChangeAggregation}
              onClose={this.handleClosePopover}
            />
          </Popover>
        )}
        {isStructured && (
          <Popover
            isOpen={!!breakoutPopoverTarget}
            onClose={this.handleClosePopover}
            target={breakoutPopoverTarget}
          >
            <BreakoutPopover
              query={query}
              breakout={
                breakoutIndex >= 0 ? query.breakouts()[breakoutIndex] : 0
              }
              onChangeBreakout={this.onChangeBreakout}
              onClose={this.handleClosePopover}
            />
          </Popover>
        )}
      </div>
    );
  }
}
