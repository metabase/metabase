import { useState } from "react";
import { useMount } from "react-use";
import { match } from "ts-pattern";

import { DataReference } from "metabase/query_builder/components/dataref/DataReference";
import { SnippetSidebar } from "metabase/query_builder/components/template_tags/SnippetSidebar";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { NativeQuerySnippet } from "metabase-types/api";

import S from "./NativeQuerySidebar.module.css";

type NativeQuerySidebarProps = {
  question: Question;
  isNative: boolean;
  isSnippetSidebarOpen?: boolean;
  isDataReferenceOpen?: boolean;
  onInsertSnippet: (snippet: NativeQuerySnippet) => void;
  onToggleDataReference: () => void;
  onToggleSnippetSidebar: () => void;
  onChangeModalSnippet: (snippet: NativeQuerySnippet) => void;
  onOpenSnippetModalWithSelectedText: () => void;
};

export function NativeQuerySidebar({
  isSnippetSidebarOpen,
  isDataReferenceOpen,
  ...props
}: NativeQuerySidebarProps) {
  if (!isSnippetSidebarOpen && !isDataReferenceOpen) {
    return null;
  }

  return (
    <Box className={S.sidebar} h="100%" w="40%" data-testid="editor-sidebar">
      {match({ isSnippetSidebarOpen, isDataReferenceOpen })
        .with({ isSnippetSidebarOpen: true }, () => (
          <QuerySnippetSidebar {...props} />
        ))
        .with({ isDataReferenceOpen: true }, () => (
          <QueryDataReferenceSidebar {...props} />
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
      pushDataReferenceStack({ type: "database", item: { id: databaseId } });
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
