import React from "react";

import cx from "classnames";

import QueryBuilderTutorial from "metabase/tutorial/QueryBuilderTutorial.jsx";

import GuiQueryEditor from "../GuiQueryEditor.jsx";
import NativeQueryEditor from "../NativeQueryEditor.jsx";
import QueryVisualization from "../QueryVisualization.jsx";
import DataReference from "../dataref/DataReference.jsx";
import TagEditorSidebar from "../template_tags/TagEditorSidebar.jsx";
import SavedQuestionIntroModal from "../SavedQuestionIntroModal.jsx";

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
      queryBuilderMode !== "worksheet" ? (
        <FilterSidebar
          question={question}
          index={isEditingFilterIndex}
          onClose={this.props.onCloseFilter}
        />
      ) : isShowingChartSettingsSidebar ? (
        <ChartSettingsSidebar {...this.props} />
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
                queryBuilderMode === "worksheet" && (
                  <div className="z2 hide sm-show mb1 mt2">
                    <div className="wrapper">
                      <GuiQueryEditor
                        {...this.props}
                        datasetQuery={card && card.dataset_query}
                      />
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
                  className="full wrapper mb2 z1"
                />
              </div>

              {ModeFooter && (
                <ModeFooter {...this.props} className="flex-no-shrink" />
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
