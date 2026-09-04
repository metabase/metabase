import { match } from "ts-pattern";

import { TagEditorSidebar } from "metabase/parameters/components/TagEditor/TagEditorSidebar";
import { DataReference } from "metabase/querying/components/DataReference/DataReference";
import type { DataReferenceItem } from "metabase/querying/components/DataReference/types";
import { SnippetSidebar } from "metabase/querying/components/SnippetSidebar";
import { useDispatch, useSelector } from "metabase/redux";
import type Question from "metabase-lib/v1/Question";
import type {
  CollectionId,
  EmbeddingParameterVisibility,
  NativeDatasetQuery,
  NativeQuerySnippet,
  RowValue,
  TemplateTag,
  TemplateTagId,
} from "metabase-types/api";

import { setTemplateTagConfig } from "../../../../actions";
import { getOriginalQuestion } from "../../../../store/selectors";
import { QuestionInfoSidebar } from "../../sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "../../sidebars/QuestionSettingsSidebar";
import { TimelineSidebar } from "../../sidebars/TimelineSidebar";

interface NativeQueryRightSidebarProps {
  question: Question;
  toggleTemplateTagsEditor: () => void;
  toggleDataReference: () => void;
  toggleSnippetSidebar: () => void;
  setModalSnippet: (snippet: NativeQuerySnippet) => void;
  openSnippetModalWithSelectedText: () => void;
  insertSnippet: (snippet: NativeQuerySnippet) => void;
  snippetCollectionId: CollectionId | null;
  setSnippetCollectionId?: (id: CollectionId | null) => void;
  onSave: (question: Question) => Promise<void>;
  isShowingTemplateTagsEditor: boolean;
  isShowingDataReference: boolean;
  isShowingSnippetSidebar: boolean;
  isShowingTimelineSidebar: boolean;
  isShowingQuestionInfoSidebar: boolean;
  isShowingQuestionSettingsSidebar: boolean;
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
    toggleTemplateTagsEditor,
    toggleDataReference,
    toggleSnippetSidebar,
    onSave,
    isShowingTemplateTagsEditor,
    isShowingDataReference,
    isShowingSnippetSidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
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
      <DataReference
        {...props}
        databaseId={question.databaseId() ?? undefined}
        onClose={toggleDataReference}
      />
    ))
    .with({ isShowingSnippetSidebar: true }, () => (
      <SnippetSidebar {...props} onClose={toggleSnippetSidebar} />
    ))
    .with({ isShowingTimelineSidebar: true }, () => <TimelineSidebar />)
    .with({ isShowingQuestionInfoSidebar: true }, () => (
      <QuestionInfoSidebar question={question} onSave={onSave} />
    ))
    .with({ isShowingQuestionSettingsSidebar: true }, () => (
      <QuestionSettingsSidebar question={question} />
    ))
    .otherwise(() => null);
};
