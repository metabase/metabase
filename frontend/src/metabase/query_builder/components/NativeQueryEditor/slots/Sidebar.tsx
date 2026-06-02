import type { SidebarFeatures } from "metabase/querying/editor/types";

import { NativeQueryEditorActionButtons } from "../NativeQueryEditorActionButtons/NativeQueryEditorActionButtons";
import { useNativeQueryEditorContext } from "../context/NativeQueryEditorContext";

interface SidebarProps {
  features?: SidebarFeatures;
}

const DEFAULT_FEATURES: SidebarFeatures = {
  dataReference: true,
  variables: true,
  snippets: true,
  promptInput: true,
  formatQuery: true,
};

/**
 * The editing-sidebar action buttons (data reference, variables, snippets,
 * auto-format, preview) shown on the right of the top bar. Renders nothing
 * while the editor is collapsed or read-only.
 */
export function Sidebar({ features = DEFAULT_FEATURES }: SidebarProps) {
  const {
    question,
    snippets,
    snippetCollections,
    isNativeEditorOpen,
    readOnly,
    isRunnable,
    isRunning,
    isResultDirty,
    isShowingDataReference,
    isShowingTemplateTagsEditor,
    isShowingSnippetSidebar,
    toggleDataReference,
    toggleSnippetSidebar,
    toggleTemplateTagsEditor,
    onOpenModal,
    onFormatQuery,
  } = useNativeQueryEditorContext();

  if (!isNativeEditorOpen || readOnly) {
    return null;
  }

  return (
    <NativeQueryEditorActionButtons
      features={features}
      onFormatQuery={onFormatQuery}
      question={question}
      snippets={snippets}
      snippetCollections={snippetCollections}
      isRunnable={isRunnable}
      isRunning={isRunning}
      isResultDirty={isResultDirty}
      isShowingDataReference={isShowingDataReference}
      isShowingTemplateTagsEditor={isShowingTemplateTagsEditor}
      isShowingSnippetSidebar={isShowingSnippetSidebar}
      toggleDataReference={toggleDataReference}
      toggleSnippetSidebar={toggleSnippetSidebar}
      toggleTemplateTagsEditor={toggleTemplateTagsEditor}
      onOpenModal={onOpenModal}
    />
  );
}
