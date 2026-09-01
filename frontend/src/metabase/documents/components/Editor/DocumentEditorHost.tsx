import { type ReactNode, useMemo } from "react";

import {
  DEFAULT_EDITOR_CAPABILITIES,
  EMPTY_CARD_EMBED_SLOTS,
  type EditorHost,
  EditorHostProvider,
  useEditorHost,
} from "metabase/rich_text_editing/tiptap/EditorHost";
import type { ClickActionsMode } from "metabase/visualizations/types";
import type { HighlightedObject } from "metabase/viz-core";
import type { Series } from "metabase-types/api";

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

import { documentClickActionMode } from "./DocumentMode";

/**
 * {@link EditorHost} plus the visualization contracts CardEmbed needs.
 * Lives in `documents` so `rich_text_editing` does not import visualizations.
 */
export type DocumentEditorHost = EditorHost & {
  useHighlighted: (
    childTargetId: string,
    series: Series | null,
    hostData?: Record<string, unknown> | null,
  ) => HighlightedObject | null;
  useVisualizationMode: (opts: {
    childTargetId: string;
    hostData?: Record<string, unknown> | null;
  }) => ClickActionsMode | undefined;
};

/**
 * Concrete {@link DocumentEditorHost} that wires the document editor's state,
 * actions, analytics and data hooks into the document-agnostic
 * `rich_text_editing` extensions. Defined at module scope so its identity is
 * stable.
 */
export const documentEditorHost: DocumentEditorHost = {
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
  useVisualizationMode: () => documentClickActionMode,
  useCardEmbedSlots: () => EMPTY_CARD_EMBED_SLOTS,
  useNodeInViewport,
  useReportPrefetchLoading,
  useDraftCardOperations,
};

export const useDocumentEditorHost = (): DocumentEditorHost => {
  // CardEmbed only mounts under DocumentEditorHostProvider
  return useEditorHost() as DocumentEditorHost;
};

export const DocumentEditorHostProvider = ({
  hostOverride,
  children,
}: {
  hostOverride?: Partial<DocumentEditorHost>;
  children: ReactNode;
}) => {
  const host = useMemo(
    () => ({ ...documentEditorHost, ...hostOverride }),
    [hostOverride],
  );
  return <EditorHostProvider value={host}>{children}</EditorHostProvider>;
};
