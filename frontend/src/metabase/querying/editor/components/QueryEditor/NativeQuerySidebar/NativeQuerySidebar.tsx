import { useRef, useState } from "react";
import { useMount } from "react-use";
import { match } from "ts-pattern";

import { TagEditorSidebar } from "metabase/querying/components/template_tags/TagEditorSidebar";
import { useSelector } from "metabase/redux";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { NativeQuerySnippet, RowValue } from "metabase-types/api";

import { DataReference } from "../../../../components/DataReference/DataReference";
import { SnippetSidebar } from "../../../../components/SnippetSidebar";
import { getSampleDatabaseId } from "../../../../selectors";

import S from "./NativeQuerySidebar.module.css";

type NativeQuerySidebarProps = {
  question: Question;
  query: Lib.Query;
  onChangeQuery: (newQuery: Lib.Query) => void;
  isNative: boolean;
  isSnippetSidebarOpen?: boolean;
  isDataReferenceOpen?: boolean;
  isTemplateTagsSidebarOpen?: boolean;
  onInsertSnippet: (snippet: NativeQuerySnippet) => void;
  onToggleDataReference: () => void;
  onToggleSnippetSidebar: () => void;
  onToggleTemplateTagsSidebar: () => void;
  onChangeModalSnippet: (snippet: NativeQuerySnippet) => void;
  onOpenSnippetModalWithSelectedText: () => void;
  parameterValues: Record<string, RowValue>;
  setParameterValues: (newParameterValues: Record<string, RowValue>) => void;
  parametersAreUserVisible?: boolean;
};

export function NativeQuerySidebar({
  isSnippetSidebarOpen,
  isDataReferenceOpen,
  isTemplateTagsSidebarOpen,
  ...props
}: NativeQuerySidebarProps) {
  if (
    !isSnippetSidebarOpen &&
    !isDataReferenceOpen &&
    !isTemplateTagsSidebarOpen
  ) {
    return null;
  }

  return (
    <Box className={S.sidebar} h="100%" w="40%" data-testid="editor-sidebar">
      {match({
        isSnippetSidebarOpen,
        isDataReferenceOpen,
        isTemplateTagsSidebarOpen,
      })
        .with({ isSnippetSidebarOpen: true }, () => (
          <QuerySnippetSidebar {...props} />
        ))
        .with({ isDataReferenceOpen: true }, () => (
          <QueryDataReferenceSidebar {...props} />
        ))
        .with({ isTemplateTagsSidebarOpen: true }, () => (
          <TemplateTagsSidebar {...props} />
        ))
        .otherwise(() => null)}
    </Box>
  );
}

function QueryDataReferenceSidebar({
  question,
  onToggleDataReference,
}: NativeQuerySidebarProps) {
  const [dataReferenceStack, setDataReferenceStack] = useState<any[]>([]);

  useMount(() => {
    const databaseId = question.databaseId();
    if (dataReferenceStack.length === 0 && databaseId !== null) {
      pushDataReferenceStack({ type: "database", id: databaseId });
    }
  });

  const pushDataReferenceStack = (ref: any) => {
    setDataReferenceStack([...dataReferenceStack, ref]);
  };

  const popDataReferenceStack = () => {
    setDataReferenceStack(dataReferenceStack.slice(0, -1));
  };

  const toggleDataReference = () => {
    onToggleDataReference();
  };

  return (
    <DataReference
      dataReferenceStack={dataReferenceStack}
      popDataReferenceStack={popDataReferenceStack}
      pushDataReferenceStack={pushDataReferenceStack}
      onClose={toggleDataReference}
    />
  );
}

function QuerySnippetSidebar({
  onInsertSnippet,
  onToggleSnippetSidebar,
  onChangeModalSnippet,
  onOpenSnippetModalWithSelectedText,
}: NativeQuerySidebarProps) {
  return (
    <SnippetSidebar
      snippetCollectionId={null}
      openSnippetModalWithSelectedText={onOpenSnippetModalWithSelectedText}
      setModalSnippet={onChangeModalSnippet}
      insertSnippet={onInsertSnippet}
      onClose={onToggleSnippetSidebar}
    />
  );
}

const VISIBILITY_ALWAYS_ENABLED = () => "enabled" as const;

function TemplateTagsSidebar({
  question,
  query,
  onToggleTemplateTagsSidebar,
  setParameterValues,
  parameterValues,
  parametersAreUserVisible,
  onChangeQuery,
}: NativeQuerySidebarProps) {
  const sampleDatabaseId = useSelector(getSampleDatabaseId);

  // The template-tag editor fires several query mutations within a single event
  // handler (e.g. switching a variable's type updates both the tag and its
  // value-source config). React props don't update between those synchronous
  // calls, so we track the latest query in a ref and compose each change on top
  // of it; otherwise the second `onChangeQuery` would clobber the first.
  const latestQueryRef = useRef(query);
  latestQueryRef.current = query;

  const commitQuery = (newQuery: Lib.Query) => {
    latestQueryRef.current = newQuery;
    onChangeQuery(newQuery);
  };

  return (
    <TagEditorSidebar
      question={question}
      query={question.legacyNativeQuery()!}
      onClose={onToggleTemplateTagsSidebar}
      sampleDatabaseId={sampleDatabaseId}
      setTemplateTag={(tag) => {
        const currentQuery = latestQueryRef.current;
        const templateTags = Lib.templateTags(currentQuery);
        commitQuery(
          Lib.withTemplateTags(currentQuery, {
            ...templateTags,
            [tag.name]: tag,
          }),
        );
      }}
      setParameterValue={(tagId, value) => {
        setParameterValues({
          ...parameterValues,
          [tagId]: value,
        });
      }}
      setTemplateTagConfig={(tag, config) => {
        const newQuery = question
          .setQuery(latestQueryRef.current)
          .legacyNativeQuery()!
          .setTemplateTagConfig(tag, config);
        commitQuery(newQuery.question().query());
      }}
      setDatasetQuery={(newQuery) => {
        commitQuery(question.setDatasetQuery(newQuery).query());
      }}
      getEmbeddedParameterVisibility={VISIBILITY_ALWAYS_ENABLED}
      parametersAreUserVisible={parametersAreUserVisible}
    />
  );
}
