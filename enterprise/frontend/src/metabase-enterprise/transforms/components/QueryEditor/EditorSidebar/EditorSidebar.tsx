import { useState } from "react";
import { match } from "ts-pattern";

import DataReference from "metabase/query_builder/components/dataref/DataReference";
import { SnippetSidebar } from "metabase/query_builder/components/template_tags/SnippetSidebar";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import S from "./EditorSidebar.module.css";

type EditorSidebarProps = {
  question: Question;
  isNative?: boolean;
  isSnippetSidebarOpen?: boolean;
  isDataReferenceOpen?: boolean;
  onToggleDataReference: () => void;
  onToggleSnippetSidebar: () => void;
};

export function EditorSidebar(props: EditorSidebarProps) {
  const { isNative } = props;
  if (!isNative) {
    return null;
  }
  return <NativeQueryEditorSidebar {...props} />;
}

function NativeQueryEditorSidebar({
  question,
  isSnippetSidebarOpen,
  isDataReferenceOpen,
  onToggleDataReference,
  onToggleSnippetSidebar,
}: EditorSidebarProps) {
  const [dataReferenceStack, setDataReferenceStack] = useState<any[]>([]);

  const pushDataReferenceStack = (ref: any) => {
    setDataReferenceStack([...dataReferenceStack, ref]);
  };

  const popDataReferenceStack = () => {
    setDataReferenceStack(dataReferenceStack.slice(0, -1));
  };

  if (!isSnippetSidebarOpen && !isDataReferenceOpen) {
    return null;
  }

  const toggleDataReference = () => {
    const databaseId = question.databaseId();
    if (dataReferenceStack.length === 0 && databaseId !== null) {
      pushDataReferenceStack({ type: "database", item: { id: databaseId } });
    }
    onToggleDataReference();
  };

  return (
    <Box className={S.sidebar} h="100%" w="40%">
      {match({ isSnippetSidebarOpen, isDataReferenceOpen })
        .with({ isSnippetSidebarOpen: true }, () => (
          <SnippetSidebar onClose={onToggleSnippetSidebar} />
        ))
        .with({ isDataReferenceOpen: true }, () => (
          <DataReference
            dataReferenceStack={dataReferenceStack}
            popDataReferenceStack={popDataReferenceStack}
            pushDataReferenceStack={pushDataReferenceStack}
            onClose={toggleDataReference}
          />
        ))
        .otherwise(() => null)}
    </Box>
  );
}
