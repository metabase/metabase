import React from "react";

import cx from "classnames";

import QueryBuilderTutorial from "metabase/tutorial/QueryBuilderTutorial";

import GuiQueryEditor from "../GuiQueryEditor";
import NativeQueryEditor from "../NativeQueryEditor";
import QueryVisualization from "../QueryVisualization";
import DataReference from "../dataref/DataReference";
import TagEditorSidebar from "../template_tags/TagEditorSidebar";
import SavedQuestionIntroModal from "../SavedQuestionIntroModal";

import Button from "metabase/components/Button";
import BreakoutName from "metabase/query_builder/components/BreakoutName";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import QueryModals from "../QueryModals";
import { ViewTitleHeader, ViewSubHeader } from "./ViewHeader";
import ViewFooter from "./ViewFooter";
import ViewSidebar from "./ViewSidebar";

import ChartSettingsSidebar from "./ChartSettingsSidebar";
import ChartTypeSidebar from "./ChartTypeSidebar";

import FilterSidebar from "./FilterSidebar";

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
      queryBuilderMode,
      mode,
    } = this.props;

    // if we don't have a card at all or no databases then we are initializing, so keep it simple
    if (!card || !databases) {
      return <div />;
    }

    const ModeFooter = mode && mode.ModeFooter;

    const leftSideBar =
      (isEditingFilterIndex != null || isAddingFilter) &&
      // NOTE: remove queryBuilderMode check once legacy query builder is removed
      queryBuilderMode !== "notebook" ? (
        <FilterSidebar
          question={question}
          index={isEditingFilterIndex}
          onClose={this.props.onCloseFilter}
        />
      ) : isShowingChartSettingsSidebar ? (
        <ChartSettingsSidebar
          {...this.props}
          onClose={() =>
            this.props.setUIControls({
              isShowingChartSettingsSidebar: false,
              isShowingChartTypeSidebar: false,
            })
          }
        />
      ) : isShowingChartTypeSidebar ? (
        <ChartTypeSidebar {...this.props} />
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

    return (
      <div className={this.props.fitClassNames}>
        <div className={cx("QueryBuilder flex flex-column bg-white spread")}>
          <ViewTitleHeader {...this.props} className="flex-no-shrink" />

          <div className="flex flex-full">
            {leftSideBar && <ViewSidebar left>{leftSideBar}</ViewSidebar>}

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

              {query instanceof StructuredQuery &&
                queryBuilderMode === "notebook" && (
                  <div className="z2 hide sm-show mb1 mt2">
                    <div className="wrapper">
                      <GuiQueryEditor {...this.props} />
                    </div>
                  </div>
                )}

              <ViewSubHeader {...this.props} />

              <div
                ref="viz"
                id="react_qb_viz"
                className="flex-full flex z1"
                style={{ transition: "opacity 0.25s ease-in-out" }}
              >
                <QueryVisualization
                  {...this.props}
                  noHeader
                  className="full mb2 z1"
                />
              </div>

              {ModeFooter && (
                <ModeFooter {...this.props} className="flex-no-shrink" />
              )}
              {question.query().breakouts().length > 0 && (
                <div className="flex py2">
                  <div className="ml-auto mr-auto">
                    <PopoverWithTrigger
                      triggerElement={
                        <Button medium>
                          <BreakoutName
                            breakout={query.breakouts()[0]}
                            query={query}
                          />
                        </Button>
                      }
                    >
                      <BreakoutPopover
                        query={query}
                        breakout={query.breakouts()[0]}
                        onChangeBreakout={newBreakout => {
                          query
                            .breakouts()[0]
                            .replace(newBreakout)
                            .update();
                          this.props.runQuestionQuery();
                        }}
                      />
                    </PopoverWithTrigger>
                  </div>
                </div>
              )}
            </div>

            {rightSideBar && <ViewSidebar right>{rightSideBar}</ViewSidebar>}
          </div>

          <ViewFooter {...this.props} className="flex-no-shrink" />
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
