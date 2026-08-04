import { type ReactNode, useMemo } from "react";

import {
  DEFAULT_EDITOR_CAPABILITIES,
  type EditorHost,
  EditorHostProvider,
} from "metabase/rich_text_editing/tiptap/EditorHost";
import { DocumentMode } from "metabase/visualizations/click-actions/modes/DocumentMode";

import { navigateToCardFromDocument } from "../../actions";
import {
  trackDocumentAddCard,
  trackDocumentAddSmartLink,
  trackDocumentAddSupportingText,
  trackDocumentAskMetabot,
  trackDocumentReplaceCard,
} from "../../analytics";
import {
  createDraftCard,
  deselectTimelineEvents,
  generateDraftCardId,
  loadMetadataForDocumentCard,
  openTimelineEventsSidebar,
  openVizSettingsSidebar,
  selectTimelineEvents,
  updateMentionsCache,
  updateVizSettings,
} from "../../documents.slice";
import { useCardData } from "../../hooks/use-card-data";
import { useDocumentCommentUrl } from "../../hooks/use-document-comment-url";
import { useDraftCardOperations } from "../../hooks/use-draft-card-operations";
import { useExternalCardDataLoader } from "../../hooks/use-external-card-data";
import {
  useNodeInViewport,
  useReportPrefetchLoading,
} from "../../hooks/use-node-in-viewport";
import { useUnresolvedDocumentCommentsCount } from "../../hooks/use-unresolved-document-comments-count";
import {
  getChildTargetId,
  getCurrentDocument,
  getHasUnsavedChanges,
  getHoveredChildTargetId,
  getSelectedEmbedIndex,
  getSelectedTimelineEventIds,
} from "../../selectors";

/**
 * Concrete {@link EditorHost} that wires the document editor's state, actions,
 * analytics and data hooks into the document-agnostic `rich_text_editing`
 * extensions. Defined at module scope so its identity is stable.
 */
export const documentEditorHost: EditorHost = {
  capabilities: DEFAULT_EDITOR_CAPABILITIES,
  selectors: {
    getCurrentDocument,
    getChildTargetId,
    getHoveredChildTargetId,
    getHasUnsavedChanges,
    getSelectedEmbedIndex,
    getSelectedTimelineEventIds,
  },
  actions: {
    createDraftCard,
    generateDraftCardId,
    loadMetadataForDocumentCard,
    openVizSettingsSidebar,
    openTimelineEventsSidebar,
    selectTimelineEvents,
    deselectTimelineEvents,
    updateVizSettings,
    updateMentionsCache,
  },
  analytics: {
    trackAddCard: trackDocumentAddCard,
    trackAddSmartLink: trackDocumentAddSmartLink,
    trackAskMetabot: trackDocumentAskMetabot,
    trackReplaceCard: trackDocumentReplaceCard,
    trackAddSupportingText: trackDocumentAddSupportingText,
  },
  navigateToCard: navigateToCardFromDocument,
  useCardData,
  useExternalCardDataLoader,
  useCommentUrl: useDocumentCommentUrl,
  useUnresolvedCommentsCount: useUnresolvedDocumentCommentsCount,
  useHighlighted: () => null,
  useVisualizationMode: () => DocumentMode,
  useNodeInViewport,
  useReportPrefetchLoading,
  useDraftCardOperations,
};

export const DocumentEditorHostProvider = ({
  hostOverride,
  children,
}: {
  hostOverride?: Partial<EditorHost>;
  children: ReactNode;
}) => {
  const host = useMemo(
    () => ({ ...documentEditorHost, ...hostOverride }),
    [hostOverride],
  );
  return <EditorHostProvider value={host}>{children}</EditorHostProvider>;
};
