// eslint-disable-next-line no-restricted-imports
import type { Moment } from "moment";
import { match } from "ts-pattern";

import { PLUGIN_AI_ENTITY_ANALYSIS } from "metabase/plugins";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import { SnippetSidebar } from "metabase/query_builder/components/template_tags/SnippetSidebar";
import { TagEditorSidebar } from "metabase/query_builder/components/template_tags/TagEditorSidebar";
import { QuestionInfoSidebar } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "metabase/query_builder/components/view/sidebars/QuestionSettingsSidebar";
import TimelineSidebar from "metabase/query_builder/components/view/sidebars/TimelineSidebar";
import type { QueryModalType } from "metabase/query_builder/constants";
import type Question from "metabase-lib/v1/Question";
import type { Timeline, TimelineEvent } from "metabase-types/api";

interface NativeQueryRightSidebarProps {
  visibleTimelineEventIds: number[];
  selectedTimelineEventIds: number[];
  xDomain: [Moment, Moment] | undefined;
  onOpenModal: ((modal: QueryModalType, modalContext?: unknown) => void) | undefined;
  onHideTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onSelectTimelineEvents: ((timelineEvents: TimelineEvent[]) => void) | undefined;
  onDeselectTimelineEvents: (() => void) | undefined;
  question: Question;
  timelineEvents: TimelineEvent[];
  timelines: Timeline[];
  toggleTemplateTagsEditor: () => void;
  toggleDataReference: () => void;
  toggleSnippetSidebar: () => void;
  showTimelineEvents: () => void;
  hideTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  selectTimelineEvents: () => void;
  deselectTimelineEvents?: () => void
  onCloseTimelines: () => void;
  onSave: (question: Question) => Promise<Question>;
  isShowingTemplateTagsEditor: boolean;
  isShowingDataReference: boolean;
  isShowingSnippetSidebar: boolean;
  isShowingTimelineSidebar: boolean;
  isShowingQuestionInfoSidebar: boolean;
  isShowingQuestionSettingsSidebar: boolean;
  isShowingAIQuestionAnalysisSidebar: boolean;
  onCloseAIQuestionAnalysisSidebar: () => void;
}

export const NativeQueryRightSidebar = (props: NativeQueryRightSidebarProps) => {
  const {
    question,
    timelineEvents,
    timelines,
    toggleTemplateTagsEditor,
    toggleDataReference,
    toggleSnippetSidebar,
    showTimelineEvents,
    hideTimelineEvents,
    selectTimelineEvents,
    deselectTimelineEvents,
    onCloseTimelines,
    onSave,
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
    isShowingAIQuestionAnalysisSidebar,
    onCloseAIQuestionAnalysisSidebar,
  } = props;

  return match({
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
    isShowingAIQuestionAnalysisSidebar,
  })
    .with({ isShowingTemplateTagsEditor: true }, () => {
      return (
        <TagEditorSidebar
          {...props}
          query={question.legacyNativeQuery()}
          onClose={toggleTemplateTagsEditor} />
      );
    })
    .with({ isShowingDataReference: true }, () => (
      <DataReference {...props} onClose={toggleDataReference} />
    ))
    .with({ isShowingSnippetSidebar: true }, () => (
      <SnippetSidebar {...props} onClose={toggleSnippetSidebar} />
    ))
    .with({ isShowingTimelineSidebar: true }, () => (
      <TimelineSidebar
        question={question}
        timelines={timelines}
        visibleTimelineEventIds={props.visibleTimelineEventIds}
        selectedTimelineEventIds={props.selectedTimelineEventIds}
        xDomain={props.xDomain}
        onOpenModal={props.onOpenModal}
        onClose={onCloseTimelines}
        onShowTimelineEvents={showTimelineEvents}
        onHideTimelineEvents={hideTimelineEvents}
        onSelectTimelineEvents={selectTimelineEvents}
        onDeselectTimelineEvents={deselectTimelineEvents}
      />
    ))
    .with({ isShowingQuestionInfoSidebar: true }, () => (
      <QuestionInfoSidebar
        question={question}
        onSave={onSave}
      />
    ))
    .with({ isShowingQuestionSettingsSidebar: true }, () => (
      <QuestionSettingsSidebar question={question} />
    ))
    .with({ isShowingAIQuestionAnalysisSidebar: true }, () => (
      <PLUGIN_AI_ENTITY_ANALYSIS.AIQuestionAnalysisSidebar
        question={question}
        visibleTimelineEvents={timelineEvents}
        timelines={timelines}
        onClose={onCloseAIQuestionAnalysisSidebar}
      />
    ))
    .otherwise(() => null);
};
