import React from "react";
import { t } from "ttag";

import cx from "classnames";

import ExplicitSize from "metabase/components/ExplicitSize";
import Popover from "metabase/components/Popover";
import DebouncedFrame from "metabase/components/DebouncedFrame";
import Subhead from "metabase/components/Subhead";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import NativeQueryEditor from "../NativeQueryEditor";
import QueryVisualization from "../QueryVisualization";
import DataReference from "../dataref/DataReference";
import TagEditorSidebar from "../template_tags/TagEditorSidebar";
import SnippetSidebar from "../template_tags/SnippetSidebar";
import SavedQuestionIntroModal from "../SavedQuestionIntroModal";

import AggregationPopover from "../AggregationPopover";
import BreakoutPopover from "../BreakoutPopover";

import QueryModals from "../QueryModals";
import { ViewTitleHeader, ViewSubHeader } from "./ViewHeader";
import NewQuestionHeader from "./NewQuestionHeader";
import ViewFooter from "./ViewFooter";
import ViewSidebar from "./ViewSidebar";
import QuestionDataSelector from "./QuestionDataSelector";

import ChartSettingsSidebar from "./sidebars/ChartSettingsSidebar";
import ChartTypeSidebar from "./sidebars/ChartTypeSidebar";
import SummarizeSidebar from "./sidebars/SummarizeSidebar";
import FilterSidebar from "./sidebars/FilterSidebar";

import Notebook from "../notebook/Notebook";
import { Motion, spring } from "react-motion";

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

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

  render() {
    const {
      question,
      query,
      card,
      isDirty,
      isResultDirty,
      isLiveResizable,
      runQuestionQuery,
      databases,
      isShowingTemplateTagsEditor,
      isShowingDataReference,
      isShowingNewbModal,
      isShowingChartTypeSidebar,
      isShowingChartSettingsSidebar,
      isShowingSummarySidebar,
      isShowingFilterSidebar,
      isShowingSnippetSidebar,
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
    const ModeFooter = mode && mode.ModeFooter;
    const isStructured = query instanceof StructuredQuery;
    const isNative = query instanceof NativeQuery;

    const isNewQuestion =
      query instanceof StructuredQuery &&
      !query.sourceTableId() &&
      !query.sourceQuery();

    if (isNewQuestion && queryBuilderMode === "view") {
      return (
        <div className={fitClassNames}>
          <div className="p4 mx2">
            <QuestionDataSelector
              query={query}
              triggerElement={
                <Subhead className="mb2">{t`Pick your data`}</Subhead>
              }
            />
          </div>
        </div>
      );
    }

    const topQuery = isStructured && query.topLevelQuery();

    // only allow editing of series for structured queries
    const onAddSeries = topQuery ? this.handleAddSeries : null;
    const onEditSeries = topQuery ? this.handleEditSeries : null;
    const onRemoveSeries =
      topQuery && topQuery.hasAggregations() ? this.handleRemoveSeries : null;
    const onEditBreakout =
      topQuery && topQuery.hasBreakouts() ? this.handleEditBreakout : null;

    const leftSideBar = isShowingChartSettingsSidebar ? (
      <ChartSettingsSidebar
        {...this.props}
        onClose={this.props.onCloseChartSettings}
      />
    ) : isShowingChartTypeSidebar ? (
      <ChartTypeSidebar {...this.props} onClose={this.props.onCloseChartType} />
    ) : null;

    const rightSideBar =
      isStructured && isShowingSummarySidebar ? (
        <SummarizeSidebar
          question={question}
          onClose={this.props.onCloseSummary}
          isResultDirty={isResultDirty}
          runQuestionQuery={runQuestionQuery}
        />
      ) : isStructured && isShowingFilterSidebar ? (
        <FilterSidebar question={question} onClose={this.props.onCloseFilter} />
      ) : isNative && isShowingTemplateTagsEditor ? (
        <TagEditorSidebar
          {...this.props}
          onClose={this.props.toggleTemplateTagsEditor}
        />
      ) : isNative && isShowingDataReference ? (
        <DataReference
          {...this.props}
          onClose={this.props.toggleDataReference}
        />
      ) : isNative && isShowingSnippetSidebar ? (
        <SnippetSidebar
          {...this.props}
          onClose={this.props.toggleSnippetSidebar}
        />
      ) : null;

    const isSidebarOpen = leftSideBar || rightSideBar;

    return (
      <div className={fitClassNames}>
        <div className={cx("QueryBuilder flex flex-column bg-white spread")}>
          <Motion
            defaultStyle={isNewQuestion ? { opacity: 0 } : { opacity: 1 }}
            style={
              isNewQuestion ? { opacity: spring(0) } : { opacity: spring(1) }
            }
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

          <div className="flex flex-full relative">
            {query instanceof StructuredQuery && (
              <Motion
                defaultStyle={
                  isNewQuestion
                    ? { opacity: 1, translateY: 0 }
                    : { opacity: 0, translateY: -100 }
                }
                style={
                  queryBuilderMode === "notebook"
                    ? {
                        opacity: spring(1),
                        translateY: spring(0),
                      }
                    : {
                        opacity: spring(0),
                        translateY: spring(-100),
                      }
                }
              >
                {({ opacity, translateY }) =>
                  opacity > 0 ? (
                    // note the `bg-white class here is necessary to obscure the other layer
                    <div
                      className="spread bg-white scroll-y z2 border-top border-bottom"
                      style={{
                        // opacity: opacity,
                        transform: `translateY(${translateY}%)`,
                      }}
                    >
                      <Notebook {...this.props} />
                    </div>
                  ) : null
                }
              </Motion>
            )}

            <ViewSidebar left isOpen={!!leftSideBar}>
              {leftSideBar}
            </ViewSidebar>

            <div
              className={cx("flex-full flex flex-column flex-basis-none", {
                "hide sm-show": isSidebarOpen,
              })}
            >
              {isNative && (
                <div className="z2 hide sm-show border-bottom mb2">
                  <NativeQueryEditor
                    {...this.props}
                    viewHeight={height}
                    isOpen={!card.dataset_query.native.query || isDirty}
                    datasetQuery={card && card.dataset_query}
                  />
                </div>
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

            <ViewSidebar right isOpen={!!rightSideBar}>
              {rightSideBar}
            </ViewSidebar>
          </div>
        </div>

        {isShowingNewbModal && (
          <SavedQuestionIntroModal
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
              onChangeAggregation={aggregation => {
                if (aggregationIndex != null) {
                  query
                    .updateAggregation(aggregationIndex, aggregation)
                    .update(null, { run: true });
                } else {
                  query.aggregate(aggregation).update(null, { run: true });
                }
                this.handleClosePopover();
              }}
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
              onChangeBreakout={breakout => {
                if (breakoutIndex != null) {
                  query
                    .updateBreakout(breakoutIndex, breakout)
                    .update(null, { run: true });
                } else {
                  query.breakout(breakout).update(null, { run: true });
                }
                this.handleClosePopover();
              }}
              onClose={this.handleClosePopover}
            />
          </Popover>
        )}
      </div>
    );
  }
}
