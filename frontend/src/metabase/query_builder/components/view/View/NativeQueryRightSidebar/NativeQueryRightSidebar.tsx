// eslint-disable-next-line no-restricted-imports
import type { Moment } from "moment-timezone";
import { match } from "ts-pattern";

import { PLUGIN_AI_ENTITY_ANALYSIS } from "metabase/plugins";
import type { EmbeddingParameterVisibility } from "metabase/public/lib/types";
import {
  DataReference,
  type DataReferenceStackItem,
} from "metabase/query_builder/components/dataref/DataReference";
import { SnippetSidebar } from "metabase/query_builder/components/template_tags/SnippetSidebar";
import { TagEditorSidebar } from "metabase/query_builder/components/template_tags/TagEditorSidebar";
import { QuestionInfoSidebar } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "metabase/query_builder/components/view/sidebars/QuestionSettingsSidebar";
import TimelineSidebar from "metabase/query_builder/components/view/sidebars/TimelineSidebar";
import type { QueryModalType } from "metabase/query_builder/constants";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Collection,
  CollectionId,
  DatabaseId,
  NativeDatasetQuery,
  NativeQuerySnippet,
  ParameterValuesConfig,
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
  showTimelineEvents: () => void;
  hideTimelineEvents: () => void;
  selectTimelineEvents: () => void;
  deselectTimelineEvents: () => void;
  onCloseTimelines: () => void;
  onSave: (question: Question) => Promise<Question>;
  onCloseAIQuestionAnalysisSidebar: () => void;
  isShowingTemplateTagsEditor: boolean;
  isShowingDataReference: boolean;
  isShowingSnippetSidebar: boolean;
  isShowingTimelineSidebar: boolean;
  isShowingQuestionInfoSidebar: boolean;
  isShowingQuestionSettingsSidebar: boolean;
  isShowingAIQuestionAnalysisSidebar: boolean;

  databases: Database[];
  sampleDatabaseId: DatabaseId;
  setDatasetQuery: (query: NativeDatasetQuery) => void;
  setTemplateTag: (tag: TemplateTag) => void;
  setTemplateTagConfig: (
    tag: TemplateTag,
    config: ParameterValuesConfig,
  ) => void;
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
  getEmbeddedParameterVisibility: (
    slug: string,
  ) => EmbeddingParameterVisibility;

  visibleTimelineEventIds: number[];
  selectedTimelineEventIds: number[];

  dataReferenceStack: DataReferenceStackItem[];
  popDataReferenceStack: () => void;
  pushDataReferenceStack: (item: DataReferenceStackItem) => void;
  onBack: () => void;

  setModalSnippet: () => void;
  openSnippetModalWithSelectedText: () => void;
  insertSnippet: () => void;
  snippets: NativeQuerySnippet[];
  snippetCollection: Collection;
  snippetCollections: Collection[];
  search: Record<string, any>[];
  setSnippetCollectionId: (
    collectionId: CollectionId | null | undefined,
  ) => void;

  xDomain: [Moment, Moment];
  onOpenModal: (modal: QueryModalType, modalContext?: unknown) => void;
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

      if (!query) {
        return null;
      }

      return (
        <TagEditorSidebar
          query={query}
          question={question}
          sampleDatabaseId={props.sampleDatabaseId}
          setDatasetQuery={props.setDatasetQuery}
          setTemplateTag={props.setTemplateTag}
          setTemplateTagConfig={props.setTemplateTagConfig}
          setParameterValue={props.setParameterValue}
          databases={props.databases}
          onClose={toggleTemplateTagsEditor}
          getEmbeddedParameterVisibility={props.getEmbeddedParameterVisibility}
        />
      );
    })
    .with({ isShowingDataReference: true }, () => (
      <DataReference
        dataReferenceStack={props.dataReferenceStack}
        popDataReferenceStack={props.popDataReferenceStack}
        pushDataReferenceStack={props.pushDataReferenceStack}
        onClose={toggleDataReference}
        onBack={props.onBack}
      />
    ))
    .with({ isShowingSnippetSidebar: true }, () => (
      <SnippetSidebar
        setModalSnippet={props.setModalSnippet}
        openSnippetModalWithSelectedText={
          props.openSnippetModalWithSelectedText
        }
        insertSnippet={props.insertSnippet}
        snippets={props.snippets}
        snippetCollection={props.snippetCollection}
        snippetCollections={props.snippetCollections}
        search={props.search}
        setSnippetCollectionId={props.setSnippetCollectionId}
        onClose={toggleSnippetSidebar}
      />
    ))
    .with({ isShowingTimelineSidebar: true }, () => (
      <TimelineSidebar
        timelines={timelines}
        question={question}
        onShowTimelineEvents={showTimelineEvents}
        onHideTimelineEvents={hideTimelineEvents}
        onSelectTimelineEvents={selectTimelineEvents}
        onDeselectTimelineEvents={deselectTimelineEvents}
        onClose={onCloseTimelines}
        visibleTimelineEventIds={props.visibleTimelineEventIds}
        selectedTimelineEventIds={props.selectedTimelineEventIds}
        xDomain={props.xDomain}
        onOpenModal={props.onOpenModal}
      />
    ))
    .with({ isShowingQuestionInfoSidebar: true }, () => (
      <QuestionInfoSidebar question={question} onSave={onSave} />
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
