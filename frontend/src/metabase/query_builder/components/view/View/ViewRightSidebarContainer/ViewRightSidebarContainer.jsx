/* eslint-disable react/prop-types */
import { NativeQueryRightSidebar } from "metabase/query_builder/components/view/View/NativeQueryRightSidebar/NativeQueryRightSidebar";
import { StructuredQueryRightSidebar } from "metabase/query_builder/components/view/View/StructuredQueryRightSidebar/StructuredQueryRightSidebar";
import * as Lib from "metabase-lib";

export const ViewRightSidebarContainer = props => {
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
