import type { ComponentProps } from "react";

import { NativeQueryRightSidebar } from "metabase/query_builder/components/view/View/NativeQueryRightSidebar/NativeQueryRightSidebar";
import { StructuredQueryRightSidebar } from "metabase/query_builder/components/view/View/StructuredQueryRightSidebar/StructuredQueryRightSidebar";
import * as Lib from "metabase-lib";

type ViewRightSidebarContainerProps = ComponentProps<
  typeof NativeQueryRightSidebar
> &
  Pick<
    ComponentProps<typeof StructuredQueryRightSidebar>,
    | "isShowingSummarySidebar"
    | "onCloseSummary"
    | "onOpenModal"
    | "updateQuestion"
    | "xDomain"
  >;

export const ViewRightSidebarContainer = (
  props: ViewRightSidebarContainerProps,
) => {
  const {
    question,
    deselectTimelineEvents,
    hideTimelineEvents,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
    isShowingAIQuestionAnalysisSidebar,
    isShowingSummarySidebar,
    isShowingTimelineSidebar,
    onCloseAIQuestionAnalysisSidebar,
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

  return isNative ? (
    <NativeQueryRightSidebar {...props} />
  ) : (
    <StructuredQueryRightSidebar
      deselectTimelineEvents={deselectTimelineEvents}
      hideTimelineEvents={hideTimelineEvents}
      isShowingQuestionInfoSidebar={isShowingQuestionInfoSidebar}
      isShowingQuestionSettingsSidebar={isShowingQuestionSettingsSidebar}
      isShowingAIQuestionAnalysisSidebar={isShowingAIQuestionAnalysisSidebar}
      isShowingSummarySidebar={isShowingSummarySidebar}
      isShowingTimelineSidebar={isShowingTimelineSidebar}
      onCloseAIQuestionAnalysisSidebar={onCloseAIQuestionAnalysisSidebar}
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
  );
};
