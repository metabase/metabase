import { type ComponentType, useState } from "react";
import { useMount } from "react-use";
import { match } from "ts-pattern";

import { Box } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { NativeQuerySnippet, RowValue } from "metabase-types/api";

import { DataReference } from "../../../../components/DataReference/DataReference";
import { SnippetSidebar } from "../../../../components/SnippetSidebar";
import type { TemplateTagsSidebarProps } from "../../../types";

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
  canUseSampleDatabase?: boolean;
  templateTagsSidebar: ComponentType<TemplateTagsSidebarProps>;
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
          <QueryTemplateTagsSidebar {...props} />
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
      databaseId={question.databaseId() ?? undefined}
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

function QueryTemplateTagsSidebar({
  templateTagsSidebar: TemplateTagsSidebar,
  question,
  query,
  onToggleTemplateTagsSidebar,
  setParameterValues,
  parameterValues,
  parametersAreUserVisible,
  onChangeQuery,
  canUseSampleDatabase,
}: NativeQuerySidebarProps) {
  return (
    <TemplateTagsSidebar
      question={question}
      query={query}
      parameterValues={parameterValues}
      parametersAreUserVisible={parametersAreUserVisible}
      canUseSampleDatabase={canUseSampleDatabase}
      onChangeQuery={onChangeQuery}
      setParameterValues={setParameterValues}
      onClose={onToggleTemplateTagsSidebar}
    />
  );
}
