import type { ComponentProps } from "react";

import * as Lib from "metabase-lib";

import { NativeQueryRightSidebar } from "../NativeQueryRightSidebar/NativeQueryRightSidebar";
import { StructuredQueryRightSidebar } from "../StructuredQueryRightSidebar/StructuredQueryRightSidebar";

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
    isShowingSummarySidebar,
    isShowingTimelineSidebar,
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
      isShowingSummarySidebar={isShowingSummarySidebar}
      isShowingTimelineSidebar={isShowingTimelineSidebar}
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
