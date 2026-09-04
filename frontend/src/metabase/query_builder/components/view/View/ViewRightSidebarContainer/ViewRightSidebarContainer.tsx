import type { ComponentProps } from "react";

import * as Lib from "metabase-lib";

import { NativeQueryRightSidebar } from "../NativeQueryRightSidebar/NativeQueryRightSidebar";
import { StructuredQueryRightSidebar } from "../StructuredQueryRightSidebar/StructuredQueryRightSidebar";

type ViewRightSidebarContainerProps = ComponentProps<
  typeof NativeQueryRightSidebar
> &
  Pick<
    ComponentProps<typeof StructuredQueryRightSidebar>,
    "isShowingSummarySidebar" | "onCloseSummary" | "updateQuestion"
  >;

export const ViewRightSidebarContainer = (
  props: ViewRightSidebarContainerProps,
) => {
  const {
    question,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
    isShowingSummarySidebar,
    isShowingTimelineSidebar,
    onCloseSummary,
    onSave,
    updateQuestion,
  } = props;

  const { isNative } = Lib.queryDisplayInfo(question.query());

  return isNative ? (
    <NativeQueryRightSidebar {...props} />
  ) : (
    <StructuredQueryRightSidebar
      isShowingQuestionInfoSidebar={isShowingQuestionInfoSidebar}
      isShowingQuestionSettingsSidebar={isShowingQuestionSettingsSidebar}
      isShowingSummarySidebar={isShowingSummarySidebar}
      isShowingTimelineSidebar={isShowingTimelineSidebar}
      onCloseSummary={onCloseSummary}
      onSave={onSave}
      question={question}
      updateQuestion={updateQuestion}
    />
  );
};
