import type { ReactNode } from "react";

import {
  type EditorHost,
  EditorHostProvider,
} from "metabase/rich_text_editing/tiptap/EditorHost";

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
  generateDraftCardId,
  loadMetadataForDocumentCard,
  openVizSettingsSidebar,
  updateMentionsCache,
  updateVizSettings,
} from "../../documents.slice";
import { useCardData } from "../../hooks/use-card-data";
import { useDraftCardOperations } from "../../hooks/use-draft-card-operations";
import { useExternalCardDataLoader } from "../../hooks/use-external-card-data";
import {
  useNodeInViewport,
  useReportPrefetchLoading,
} from "../../hooks/use-node-in-viewport";
import { useUnresolvedCommentsCount } from "../../hooks/use-unresolved-comments-count";
import {
  getChildTargetId,
  getCurrentDocument,
  getHasUnsavedChanges,
  getHoveredChildTargetId,
} from "../../selectors";

/**
 * Concrete {@link EditorHost} that wires the document editor's state, actions,
 * analytics and data hooks into the document-agnostic `rich_text_editing`
 * extensions. Defined at module scope so its identity is stable.
 */
export const documentEditorHost: EditorHost = {
  selectors: {
    getCurrentDocument,
    getChildTargetId,
    getHoveredChildTargetId,
    getHasUnsavedChanges,
  },
  actions: {
    createDraftCard,
    generateDraftCardId,
    loadMetadataForDocumentCard,
    openVizSettingsSidebar,
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
  useUnresolvedCommentsCount,
  useNodeInViewport,
  useReportPrefetchLoading,
  useDraftCardOperations,
};

export const DocumentEditorHostProvider = ({
  children,
}: {
  children: ReactNode;
}) => (
  <EditorHostProvider value={documentEditorHost}>{children}</EditorHostProvider>
);
