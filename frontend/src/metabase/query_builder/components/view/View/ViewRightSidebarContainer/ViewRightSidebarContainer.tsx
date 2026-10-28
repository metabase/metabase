import type { ComponentProps } from "react";

import * as Lib from "metabase-lib";

import { NativeQueryRightSidebar } from "../NativeQueryRightSidebar/NativeQueryRightSidebar";
import { StructuredQueryRightSidebar } from "../StructuredQueryRightSidebar/StructuredQueryRightSidebar";

type ViewRightSidebarContainerProps = ComponentProps<
  typeof NativeQueryRightSidebar
> &
  Pick<
    ComponentProps<typeof StructuredQueryRightSidebar>,
    "isShowingSummarySidebar" | "updateQuestion"
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
      onSave={onSave}
      question={question}
      updateQuestion={updateQuestion}
    />
  );
};
