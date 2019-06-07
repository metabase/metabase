import React from "react";

import cx from "classnames";

import QueryBuilderTutorial from "metabase/tutorial/QueryBuilderTutorial";

import NativeQueryEditor from "../NativeQueryEditor";
import QueryVisualization from "../QueryVisualization";
import DataReference from "../dataref/DataReference";
import TagEditorSidebar from "../template_tags/TagEditorSidebar";
import SavedQuestionIntroModal from "../SavedQuestionIntroModal";

import DebouncedFrame from "metabase/components/DebouncedFrame";

import QueryModals from "../QueryModals";
import { ViewTitleHeader, ViewSubHeader } from "./ViewHeader";
import ViewFooter from "./ViewFooter";
import ViewSidebar from "./ViewSidebar";

import ChartSettingsSidebar from "./sidebars/ChartSettingsSidebar";
import ChartTypeSidebar from "./sidebars/ChartTypeSidebar";

import FilterSidebar from "./sidebars/FilterSidebar";
// import AggregationSidebar from "./sidebars/AggregationSidebar";
// import BreakoutSidebar from "./sidebars/BreakoutSidebar";
import SummarizeSidebar from "./sidebars/SummarizeSidebar";

import Notebook from "../notebook/Notebook";
import { Motion, spring } from "react-motion";

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

export default class View extends React.Component {
  render() {
    const {
      question,
      query,
      card,
      isDirty,
      databases,
      isShowingTemplateTagsEditor,
      isShowingDataReference,
      isShowingTutorial,
      isShowingNewbModal,
      isShowingChartTypeSidebar,
      isShowingChartSettingsSidebar,
      isAddingFilter,
      isEditingFilterIndex,
      isAddingAggregation,
      isEditingAggregationIndex,
      isAddingBreakout,
      isEditingBreakoutIndex,
      queryBuilderMode,
      mode,
    } = this.props;

    // if we don't have a card at all or no databases then we are initializing, so keep it simple
    if (!card || !databases) {
      return <div />;
    }

    const ModeFooter = mode && mode.ModeFooter;
    const isStructured = query instanceof StructuredQuery;

    // only allow editing of series for structured queries
    const onAddSeries = isStructured ? this.props.onOpenAddAggregation : null;
    const onEditSeries = isStructured
      ? (card, index) => this.props.onOpenEditAggregation(index)
      : null;
    const onRemoveSeries =
      isStructured && query.aggregations().length > 1
        ? (card, index) => {
            const agg = query.aggregations()[index];
            agg.remove().update(null, { run: true });
          }
        : null;
    const onEditBreakout =
      isStructured && query.breakouts().length > 0
        ? this.props.onOpenEditBreakout
        : null;

    const leftSideBar =
      isStructured && (isEditingFilterIndex != null || isAddingFilter) ? (
        <FilterSidebar
          question={question}
          index={isEditingFilterIndex}
          onClose={this.props.onCloseFilter}
        />
      ) : isStructured &&
        (isEditingAggregationIndex != null || isAddingAggregation) ? (
        <SummarizeSidebar
          question={question}
          initialAggregationIndex={isEditingAggregationIndex}
          onClose={this.props.onCloseAggregation}
        />
      ) : isStructured &&
        (isEditingBreakoutIndex != null || isAddingBreakout) ? (
        <SummarizeSidebar
          question={question}
          initialBreakoutIndex={isEditingBreakoutIndex}
          onClose={this.props.onCloseBreakout}
        />
      ) : isShowingChartSettingsSidebar ? (
        <ChartSettingsSidebar
          {...this.props}
          onClose={this.props.onCloseChartSettings}
        />
      ) : isShowingChartTypeSidebar ? (
        <ChartTypeSidebar
          {...this.props}
          onClose={this.props.onCloseChartType}
        />
      ) : null;

    const rightSideBar =
      isShowingTemplateTagsEditor && query instanceof NativeQuery ? (
        <TagEditorSidebar
          {...this.props}
          onClose={() => this.props.toggleTemplateTagsEditor()}
        />
      ) : isShowingDataReference ? (
        <DataReference
          {...this.props}
          onClose={() => this.props.toggleDataReference()}
        />
      ) : null;

    const newQuestion = query instanceof StructuredQuery && !query.table();

    return (
      <div className={this.props.fitClassNames}>
        <div className={cx("QueryBuilder flex flex-column bg-white spread")}>
          <Motion
            defaultStyle={newQuestion ? { opacity: 0 } : { opacity: 1 }}
            style={
              newQuestion ? { opacity: spring(0) } : { opacity: spring(1) }
            }
          >
            {({ opacity }) => (
              <ViewTitleHeader
                {...this.props}
                className="flex-no-shrink z3 bg-white"
                style={{ opacity }}
              />
            )}
          </Motion>

          <div className="flex flex-full relative">
            {query instanceof StructuredQuery && (
              <Motion
                defaultStyle={
                  newQuestion
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

            <div className="flex-full flex flex-column">
              {query instanceof NativeQuery && (
                <div className="z2 hide sm-show border-bottom">
                  <NativeQueryEditor
                    {...this.props}
                    isOpen={!card.dataset_query.native.query || isDirty}
                    datasetQuery={card && card.dataset_query}
                  />
                </div>
              )}

              <ViewSubHeader {...this.props} />

              <DebouncedFrame className="flex-full" style={{ flexGrow: 1 }}>
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

        {isShowingTutorial && (
          <QueryBuilderTutorial onClose={() => this.props.closeQbTutorial()} />
        )}

        {isShowingNewbModal && (
          <SavedQuestionIntroModal
            onClose={() => this.props.closeQbNewbModal()}
          />
        )}

        <QueryModals {...this.props} />
      </div>
    );
  }
}
