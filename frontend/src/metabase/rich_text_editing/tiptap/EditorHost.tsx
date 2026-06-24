import type { Editor } from "@tiptap/react";
import { createContext, useContext } from "react";

import type { State } from "metabase/redux/store";
import type Question from "metabase-lib/v1/Question";
import type {
  Card,
  Dataset,
  Document,
  RawSeries,
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

/** Document state read by most extensions, regardless of which are enabled. */
export interface EditorDocumentHost {
  selectors: {
    getCurrentDocument: Selector<Document | null>;
    getHasUnsavedChanges: Selector<boolean>;
  };
}

/** Embedding, rendering and authoring cards: the CardEmbed node, the
 *  create/modify-question modals, and the Metabot embed. */
export interface EditorCardHost {
  navigateToCard: (
    url: string,
    document?: Document | null,
  ) => DispatchableAction;
  useCardData: (props: { id: number; skip?: boolean }) => UseCardDataResult;
  useExternalCardDataLoader: (
    cardId: number,
    opts?: { skip?: boolean },
  ) => UseCardDataResult;
  useDraftCardOperations: (
    draftCard: Card | null | undefined,
    card: Card | null | undefined,
    cardId: number,
    editorInstance: Editor | null | undefined,
    selectedEmbedIndex: number | null,
    regularDataset: Dataset | null | undefined,
  ) => DraftCardOperations;
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
    updateVizSettings: (payload: {
      cardId: number;
      settings: VisualizationSettings;
    }) => DispatchableAction;
  };
}

/** Comment menus on blocks and card embeds. */
export interface EditorCommentsHost {
  selectors: {
    getChildTargetId: Selector<string | undefined>;
    getHoveredChildTargetId: Selector<string | undefined>;
  };
  useUnresolvedCommentsCount: (
    nodeId: string,
    opts?: { skip?: boolean },
  ) => number;
}

/** Viewport-aware lazy loading: hosts with a scroll container defer
 *  data fetching until a node is near the viewport. The default host reports
 *  everything as visible so other editors load eagerly. */
export interface EditorViewportHost {
  useNodeInViewport: (id?: string) => NodeViewportState;
  useReportPrefetchLoading: (id: string, isLoading: boolean) => void;
}

/** Mention / smart-link suggestions. */
export interface EditorMentionsHost {
  actions: {
    updateMentionsCache: (payload: {
      entityId: string;
      model: string;
      name: string;
    }) => DispatchableAction;
  };
}

/** Product analytics for editor affordances. */
export interface EditorAnalyticsHost {
  analytics: {
    trackAddCard: (document?: Document | null) => void;
    trackAddSmartLink: (document?: Document | null) => void;
    trackAskMetabot: (document?: Document | null) => void;
    trackReplaceCard: (document?: Document | null) => void;
    trackAddSupportingText: (document?: Document | null) => void;
  };
}

/**
 * The capabilities the editor extensions need, injected by the host so `rich_text_editing` stays an agnostic editor primitive.
 * Consumers that do not configure a host (e.g. the comments editor) get
 * {@link DEFAULT_EDITOR_HOST}.
 */
export type EditorHost = EditorDocumentHost &
  EditorCardHost &
  EditorCommentsHost &
  EditorViewportHost &
  EditorMentionsHost &
  EditorAnalyticsHost;

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
  },
  actions: {
    createDraftCard: () => ({ type: "@@editor-host/noop" }),
    generateDraftCardId: () => -1,
    loadMetadataForDocumentCard: () => ({ type: "@@editor-host/noop" }),
    openVizSettingsSidebar: () => ({ type: "@@editor-host/noop" }),
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
  useDraftCardOperations: () => ({ ensureDraftCard: () => -1 }),
};

const EditorHostContext = createContext<EditorHost>(DEFAULT_EDITOR_HOST);

export const EditorHostProvider = EditorHostContext.Provider;

/** Access the host capabilities configured for the surrounding editor. */
export const useEditorHost = (): EditorHost => useContext(EditorHostContext);
