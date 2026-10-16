import type { ComponentProps } from "react";

import * as Lib from "metabase-lib";

import { NativeQueryRightSidebar } from "../NativeQueryRightSidebar/NativeQueryRightSidebar";
import { StructuredQueryRightSidebar } from "../StructuredQueryRightSidebar/StructuredQueryRightSidebar";

type ViewRightSidebarContainerProps = ComponentProps<
  typeof NativeQueryRightSidebar
>;

export const ViewRightSidebarContainer = (
  props: ViewRightSidebarContainerProps,
) => {
  const {
    question,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
    isShowingTimelineSidebar,
    onSave,
  } = props;

  const { isNative } = Lib.queryDisplayInfo(question.query());

  return isNative ? (
    <NativeQueryRightSidebar {...props} />
  ) : (
    <StructuredQueryRightSidebar
      isShowingQuestionInfoSidebar={isShowingQuestionInfoSidebar}
      isShowingQuestionSettingsSidebar={isShowingQuestionSettingsSidebar}
      isShowingTimelineSidebar={isShowingTimelineSidebar}
      onSave={onSave}
      question={question}
    />
  );
};
