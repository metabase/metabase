import { match } from "ts-pattern";

import DataReference from "metabase/query_builder/components/dataref/DataReference";
import { SnippetSidebar } from "metabase/query_builder/components/template_tags/SnippetSidebar";
import { TagEditorSidebar } from "metabase/query_builder/components/template_tags/TagEditorSidebar";
import { QuestionInfoSidebar } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "metabase/query_builder/components/view/sidebars/QuestionSettingsSidebar";
import TimelineSidebar from "metabase/query_builder/components/view/sidebars/TimelineSidebar";

export const NativeQueryRightSidebar = (props) => {
  const {
    question,
    toggleTemplateTagsEditor,
    toggleDataReference,
    toggleSnippetSidebar,
    showTimelineEvent,
    showTimelineEvents,
    hideTimelineEvents,
    selectTimelineEvents,
    deselectTimelineEvents,
    onCloseTimelines,
    onSave,
    onCloseQuestionInfo,
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
  } = props;

  return match({
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
  })
    .with({ isShowingTemplateTagsEditor: true }, () => (
      <TagEditorSidebar
        {...props}
        query={question.legacyNativeQuery()}
        onClose={toggleTemplateTagsEditor}
      />
    ))
    .with({ isShowingDataReference: true }, () => (
      <DataReference {...props} onClose={toggleDataReference} />
    ))
    .with({ isShowingSnippetSidebar: true }, () => (
      <SnippetSidebar {...props} onClose={toggleSnippetSidebar} />
    ))
    .with({ isShowingTimelineSidebar: true }, () => (
      <TimelineSidebar
        {...props}
        onShowTimelineEvent={showTimelineEvent}
        onShowTimelineEvents={showTimelineEvents}
        onHideTimelineEvents={hideTimelineEvents}
        onSelectTimelineEvents={selectTimelineEvents}
        onDeselectTimelineEvents={deselectTimelineEvents}
        onClose={onCloseTimelines}
      />
    ))
    .with({ isShowingQuestionInfoSidebar: true }, () => (
      <QuestionInfoSidebar
        question={question}
        onSave={onSave}
        onClose={onCloseQuestionInfo}
      />
    ))
    .with({ isShowingQuestionSettingsSidebar: true }, () => (
      <QuestionSettingsSidebar question={question} />
    ))
    .otherwise(() => null);
};
