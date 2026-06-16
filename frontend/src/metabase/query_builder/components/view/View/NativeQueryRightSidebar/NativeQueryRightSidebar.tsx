import { match } from "ts-pattern";

import { setTemplateTagConfig } from "metabase/query_builder/actions";
import { AIQuestionAnalysisSidebar } from "metabase/query_builder/components/AIQuestionAnalysisSidebar";
import { QuestionInfoSidebar } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "metabase/query_builder/components/view/sidebars/QuestionSettingsSidebar";
import { TimelineSidebar } from "metabase/query_builder/components/view/sidebars/TimelineSidebar";
import { getOriginalQuestion } from "metabase/query_builder/selectors";
import { DataReference } from "metabase/querying/components/DataReference/DataReference";
import type { DataReferenceItem } from "metabase/querying/components/DataReference/types";
import { SnippetSidebar } from "metabase/querying/components/SnippetSidebar";
import { TagEditorSidebar } from "metabase/querying/components/template_tags/TagEditorSidebar";
import { useDispatch, useSelector } from "metabase/redux";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  CollectionId,
  DatabaseId,
  EmbeddingParameterVisibility,
  NativeDatasetQuery,
  NativeQuerySnippet,
  RowValue,
  TemplateTag,
  TemplateTagId,
  Timeline,
  TimelineEvent,
} from "metabase-types/api";

interface NativeQueryRightSidebarProps {
  question: Question;
  timelineEvents: TimelineEvent[];
  timelines: Timeline[];
  toggleTemplateTagsEditor: () => void;
  toggleDataReference: () => void;
  toggleSnippetSidebar: () => void;
  setModalSnippet: (snippet: NativeQuerySnippet) => void;
  openSnippetModalWithSelectedText: () => void;
  insertSnippet: (snippet: NativeQuerySnippet) => void;
  snippetCollectionId: CollectionId | null;
  setSnippetCollectionId?: (id: CollectionId | null) => void;
  showTimelineEvents: () => void;
  hideTimelineEvents: () => void;
  selectTimelineEvents: () => void;
  deselectTimelineEvents: () => void;
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
  visibleTimelineEventIds: number[];
  selectedTimelineEventIds: number[];
  databases: Database[];
  sampleDatabaseId: DatabaseId;
  setDatasetQuery: (query: NativeDatasetQuery) => void;
  setTemplateTag: (tag: TemplateTag) => void;
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
  getEmbeddedParameterVisibility: (
    slug: string,
  ) => EmbeddingParameterVisibility;

  dataReferenceStack: DataReferenceItem[];
  pushDataReferenceStack: (item: DataReferenceItem) => void;
  popDataReferenceStack: () => void;
}

export const NativeQueryRightSidebar = (
  props: NativeQueryRightSidebarProps,
) => {
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

  const dispatch = useDispatch();
  const originalQuestion = useSelector(getOriginalQuestion);

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
      const query = question.legacyNativeQuery();
      return query ? (
        <TagEditorSidebar
          {...props}
          query={query}
          originalQuestion={originalQuestion}
          setTemplateTagConfig={(tag, config) =>
            dispatch(setTemplateTagConfig(tag, config))
          }
          onClose={toggleTemplateTagsEditor}
        />
      ) : null;
    })
    .with({ isShowingDataReference: true }, () => (
      <DataReference {...props} onClose={toggleDataReference} />
    ))
    .with({ isShowingSnippetSidebar: true }, () => (
      <SnippetSidebar {...props} onClose={toggleSnippetSidebar} />
    ))
    .with({ isShowingTimelineSidebar: true }, () => (
      <TimelineSidebar
        {...props}
        onShowTimelineEvents={showTimelineEvents}
        onHideTimelineEvents={hideTimelineEvents}
        onSelectTimelineEvents={selectTimelineEvents}
        onDeselectTimelineEvents={deselectTimelineEvents}
        onClose={onCloseTimelines}
      />
    ))
    .with({ isShowingQuestionInfoSidebar: true }, () => (
      <QuestionInfoSidebar question={question} onSave={onSave} />
    ))
    .with({ isShowingQuestionSettingsSidebar: true }, () => (
      <QuestionSettingsSidebar question={question} />
    ))
    .with({ isShowingAIQuestionAnalysisSidebar: true }, () => (
      <AIQuestionAnalysisSidebar
        question={question}
        visibleTimelineEvents={timelineEvents}
        timelines={timelines}
        onClose={onCloseAIQuestionAnalysisSidebar}
      />
    ))
    .otherwise(() => null);
};
