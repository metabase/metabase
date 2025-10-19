import { useState } from "react";
import { useMount } from "react-use";
import { match } from "ts-pattern";

import DataReference from "metabase/query_builder/components/dataref/DataReference";
import { SnippetSidebar } from "metabase/query_builder/components/template_tags/SnippetSidebar";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { NativeQuerySnippet } from "metabase-types/api";

import S from "./EditorSidebar.module.css";

type EditorSidebarProps = {
  question: Question;
  isNative?: boolean;
  isSnippetSidebarOpen?: boolean;
  isDataReferenceOpen?: boolean;
  onToggleDataReference: () => void;
  onToggleSnippetSidebar: () => void;
  onChangeModalSnippet: (snippet: NativeQuerySnippet) => void;
  onInsertSnippet: (snippet: NativeQuerySnippet) => void;
};

export function EditorSidebar(props: EditorSidebarProps) {
  const { isNative } = props;
  if (!isNative) {
    return null;
  }
  return <NativeQueryEditorSidebar {...props} />;
}

function NativeQueryEditorSidebar({
  isSnippetSidebarOpen,
  isDataReferenceOpen,
  ...props
}: EditorSidebarProps) {
  if (!isSnippetSidebarOpen && !isDataReferenceOpen) {
    return null;
  }

  return (
    <Box className={S.sidebar} h="100%" w="40%" data-testid="editor-sidebar">
      {match({ isSnippetSidebarOpen, isDataReferenceOpen })
        .with({ isSnippetSidebarOpen: true }, () => (
          <EditorSnippetSidebar {...props} />
        ))
        .with({ isDataReferenceOpen: true }, () => (
          <EditorDataReferenceSidebar {...props} />
        ))
        .otherwise(() => null)}
    </Box>
  );
}

function EditorDataReferenceSidebar({
  question,
  onToggleDataReference,
}: EditorSidebarProps) {
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

function EditorSnippetSidebar({
  onToggleSnippetSidebar,
  onChangeModalSnippet,
  onInsertSnippet,
}: EditorSidebarProps) {
  return (
    <SnippetSidebar
      onClose={onToggleSnippetSidebar}
      setModalSnippet={onChangeModalSnippet}
      openSnippetModalWithSelectedText={onChangeModalSnippet}
      snippetCollectionId={null}
      insertSnippet={onInsertSnippet}
    />
  );
}
