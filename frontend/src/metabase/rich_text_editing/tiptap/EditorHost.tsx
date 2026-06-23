import type { Editor } from "@tiptap/react";
import { createContext, useContext } from "react";

import type { State } from "metabase/redux/store";
import type { DocumentHost } from "metabase/redux/store/documents";
import type Question from "metabase-lib/v1/Question";
import type { EntityId } from "metabase-types/api/comments";
import type {
  Card,
  Dataset,
  Document,
  RawSeries,
  StoredResultSort,
  VisualizationSettings,
} from "metabase-types/api";

/**
 * Result returned by the card-data hooks the host provides to the CardEmbed
 * extension. Declared by the editor primitive so extensions can depend on the
 * shape without importing the host (documents) implementation.
 */
export interface UseCardDataResult {
  card?: Card;
  dataset?: Dataset;
  isLoading: boolean;
  series: RawSeries | null;
  question?: Question;
  error?: "not found" | "unknown" | null;
  draftCard?: Card;
  regularDataset?: Dataset;
}

export interface DraftCardOperations {
  ensureDraftCard: (
    initialModifications?: Partial<Card>,
    isVizSettingsOnly?: boolean,
  ) => number;
}

/**
 * Viewport/prefetch state for a node view, produced by the host's
 * {@link EditorHost.useNodeInViewport}. Hosts without a scroll container
 * (comments, metabot) report everything as in-viewport so embedded content
 * loads eagerly.
 */
export interface NodeViewportState {
  ref: (instance: HTMLElement | null) => void;
  isInViewport: boolean;
  shouldLoadData: boolean;
}

type Selector<T> = (state: State) => T;

/**
 * A redux action or thunk produced by a host action creator. Broad by design
 * so injected creators dispatch cleanly through the app's overloaded dispatch.
 */
type DispatchableAction = any;

/**
 * The document-specific capabilities the editor extensions need, injected by
 * the host (e.g. documents) rather than imported. This keeps `rich_text_editing`
 * a document-agnostic editor primitive: consumers that do not configure a host
 * (e.g. the comments editor) transparently get {@link DEFAULT_EDITOR_HOST}.
 */
export interface EditorHost {
  selectors: {
    getCurrentDocument: Selector<Document | null>;
    getChildTargetId: Selector<string | undefined>;
    getHoveredChildTargetId: Selector<string | undefined>;
    getHasUnsavedChanges: Selector<boolean>;
    // Which surface is rendering the editor ("standalone" document vs an
    // "exploration"). Extensions read this through the host instead of the
    // `documents` `getDocumentHost` selector, so the editor stays decoupled.
    // (A cleaner follow-up is to replace surface comparisons with explicit
    // host capability flags — see PR description.)
    getDocumentHost: Selector<DocumentHost>;
  };
  // Action/thunk creators return the redux action or thunk to be dispatched.
  // Typed as `any` so they satisfy the app's overloaded `dispatch` (which
  // accepts both plain actions and thunks) without coupling this primitive to
  // the host's concrete action types.
  actions: {
    createDraftCard: (payload: {
      originalCard: Card | undefined;
      modifiedData: Partial<Card>;
      draftId: number;
    }) => DispatchableAction;
    generateDraftCardId: () => number;
    loadMetadataForDocumentCard: (card: Card) => DispatchableAction;
    openVizSettingsSidebar: (payload: {
      embedIndex: number;
    }) => DispatchableAction;
    openTimelineEventsSidebar: (payload: {
      embedIndex: number;
    }) => DispatchableAction;
    updateVizSettings: (payload: {
      cardId: number;
      settings: VisualizationSettings;
    }) => DispatchableAction;
    updateMentionsCache: (payload: {
      entityId: string;
      model: string;
      name: string;
    }) => DispatchableAction;
  };
  analytics: {
    trackAddCard: (document?: Document | null) => void;
    trackAddSmartLink: (document?: Document | null) => void;
    trackAskMetabot: (document?: Document | null) => void;
    trackReplaceCard: (document?: Document | null) => void;
    trackAddSupportingText: (document?: Document | null) => void;
  };
  navigateToCard: (
    url: string,
    document?: Document | null,
  ) => DispatchableAction;
  useCardData: (props: {
    id: number;
    skip?: boolean;
    // Static-card mode (explorations): read from a cached stored_result snapshot.
    storedResultId?: number;
    storedResultSort?: StoredResultSort;
  }) => UseCardDataResult;
  useExternalCardDataLoader: (
    cardId: number,
    opts?: { skip?: boolean },
  ) => UseCardDataResult;
  useUnresolvedCommentsCount: (
    nodeId: string,
    opts?: { skip?: boolean },
  ) => number;
  // Viewport-aware lazy loading: hosts with a scroll container (documents)
  // defer data fetching until a node is near the viewport. The default host
  // reports everything as visible so other editors load eagerly.
  useNodeInViewport: (id?: string) => NodeViewportState;
  useReportPrefetchLoading: (id: string, isLoading: boolean) => void;
  // Builds the comment-sidebar URL for a node. Centralised by the host so the
  // editor doesn't import the `documents` useCommentUrl hook.
  useCommentUrl: (opts: {
    childTargetId: EntityId | null;
    searchParams?: Record<string, string>;
  }) => string;
  useDraftCardOperations: (
    draftCard: Card | null | undefined,
    card: Card | null | undefined,
    cardId: number,
    editorInstance: Editor | null | undefined,
    selectedEmbedIndex: number | null,
    regularDataset: Dataset | null | undefined,
  ) => DraftCardOperations;
}

const noop = () => undefined;

/**
 * Inert host used when no provider is configured (e.g. the comments and metabot
 * editors). State selectors resolve to empty, operations are no-ops, and the
 * card-data hooks return idle results — the extensions that rely on a real host
 * (CardEmbed, SupportingText, Metabot embed) are only rendered by hosts that
 * provide one.
 */
export const DEFAULT_EDITOR_HOST: EditorHost = {
  selectors: {
    getCurrentDocument: () => null,
    getChildTargetId: () => undefined,
    getHoveredChildTargetId: () => undefined,
    getHasUnsavedChanges: () => false,
    getDocumentHost: () => "standalone",
  },
  actions: {
    createDraftCard: () => ({ type: "@@editor-host/noop" }),
    generateDraftCardId: () => -1,
    loadMetadataForDocumentCard: () => ({ type: "@@editor-host/noop" }),
    openVizSettingsSidebar: () => ({ type: "@@editor-host/noop" }),
    openTimelineEventsSidebar: () => ({ type: "@@editor-host/noop" }),
    updateVizSettings: () => ({ type: "@@editor-host/noop" }),
    updateMentionsCache: () => ({ type: "@@editor-host/noop" }),
  },
  analytics: {
    trackAddCard: noop,
    trackAddSmartLink: noop,
    trackAskMetabot: noop,
    trackReplaceCard: noop,
    trackAddSupportingText: noop,
  },
  navigateToCard: () => ({ type: "@@editor-host/noop" }),
  useCardData: () => ({ isLoading: false, series: null }),
  useExternalCardDataLoader: () => ({ isLoading: false, series: null }),
  useUnresolvedCommentsCount: () => 0,
  useNodeInViewport: () => ({
    ref: () => undefined,
    isInViewport: true,
    shouldLoadData: true,
  }),
  useReportPrefetchLoading: () => undefined,
  useCommentUrl: () => "",
  useDraftCardOperations: () => ({ ensureDraftCard: () => -1 }),
};

const EditorHostContext = createContext<EditorHost>(DEFAULT_EDITOR_HOST);

export const EditorHostProvider = EditorHostContext.Provider;

/** Access the host capabilities configured for the surrounding editor. */
export const useEditorHost = (): EditorHost => useContext(EditorHostContext);
