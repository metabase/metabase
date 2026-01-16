import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { slugify } from "metabase/lib/formatting";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { PLUGIN_METABOT } from "metabase/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import {
  useCreateWorkspaceTransformMutation,
  useLazyGetTransformQuery,
} from "metabase-enterprise/api";
import {
  type ApplySuggestionPayload,
  type ApplySuggestionResult,
  type MetabotSuggestionActions,
  useRegisterMetabotSuggestionActions,
} from "metabase-enterprise/metabot/context";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks/use-metabot-agent";
import { useMetabotReactions } from "metabase-enterprise/metabot/hooks/use-metabot-reactions";
import type {
  MetabotConverstationState,
  MetabotState,
  MetabotSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import { metabotActions } from "metabase-enterprise/metabot/state/reducer";
import { getMetabotState } from "metabase-enterprise/metabot/state/selectors";
import { useEnterpriseSelector } from "metabase-enterprise/redux";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  DatabaseId,
  DraftTransformSource,
  Transform,
  UnsavedTransform,
  WorkspaceTransform,
  WorkspaceTransformListItem,
} from "metabase-types/api";
import { isUnsavedTransform } from "metabase-types/api";

import {
  type AnyWorkspaceTransform,
  getTransformId,
  useWorkspace,
} from "./WorkspaceProvider";

const normalizeSource = (
  source: DraftTransformSource,
  metadata: Metadata,
): DraftTransformSource => {
  if (source.type !== "query") {
    return source;
  }

  const question = Question.create({
    dataset_query: source.query,
    metadata,
  });
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);
  const normalizedQuery = isNative
    ? Lib.withNativeQuery(query, Lib.rawNativeQuery(query))
    : query;

  return {
    type: "query",
    query: question.setQuery(normalizedQuery).datasetQuery(),
  };
};

type MetabotConversationSnapshot = Pick<
  MetabotConverstationState,
  | "messages"
  | "history"
  | "state"
  | "activeToolCalls"
  | "errorMessages"
  | "conversationId"
> & { suggestedTransforms: MetabotSuggestedTransform[] };

type UseWorkspaceMetabotParams = {
  workspaceId: number;
  databaseId: DatabaseId | null | undefined;
  transformId: string | undefined;
  isLoading: boolean;
  allTransforms: (UnsavedTransform | WorkspaceTransformListItem)[];
  setTab: (tab: string) => void;
  handleNavigateToTransform: (transformId: number) => void;
};

type UseWorkspaceMetabotReturn = {
  isMetabotAvailable: boolean;
  metabotContextTransform: AnyWorkspaceTransform | undefined;
  metabotContextSource: DraftTransformSource | undefined;
  setMetabotContextTransform: (
    transform: AnyWorkspaceTransform | undefined,
  ) => void;
  setMetabotContextSource: (source: DraftTransformSource | undefined) => void;
};

export function useWorkspaceMetabot({
  workspaceId,
  databaseId,
  transformId: _transformId,
  isLoading: _isLoading,
  allTransforms,
  setTab,
  handleNavigateToTransform,
}: UseWorkspaceMetabotParams): UseWorkspaceMetabotReturn {
  const dispatch = useDispatch();
  const metadata = useEnterpriseSelector(getMetadata);
  const { openedTabs, setActiveTab, addOpenedTransform, setActiveTransform } =
    useWorkspace();

  const isMetabotAvailable = PLUGIN_METABOT.isEnabled();
  const { navigateToPath, setNavigateToPath } = useMetabotReactions();
  const {
    resetConversation: resetMetabotConversation,
    visible: isMetabotVisible,
  } = useMetabotAgent();

  const [createWorkspaceTransform] = useCreateWorkspaceTransformMutation();
  const [getTransform] = useLazyGetTransformQuery();

  const metabotState = useEnterpriseSelector(getMetabotState);
  const metabotStateRef = useRef<MetabotState>(metabotState);
  const metabotSnapshots = useRef<Map<number, MetabotConversationSnapshot>>(
    new Map(),
  );

  const [metabotContextTransform, setMetabotContextTransform] = useState<
    AnyWorkspaceTransform | undefined
  >();
  const [metabotContextSource, setMetabotContextSource] = useState<
    DraftTransformSource | undefined
  >();

  const openTaggedTransformInWorkspace = useCallback(
    (nextTransform: Transform) => {
      const taggedTransform = { ...nextTransform, type: "transform" as const };
      addOpenedTransform(taggedTransform);
      setActiveTransform(taggedTransform);
    },
    [addOpenedTransform, setActiveTransform],
  );

  const openWorkspaceTransformInWorkspace = useCallback(
    (nextTransform: WorkspaceTransform) => {
      addOpenedTransform(nextTransform);
      setActiveTransform(nextTransform);
    },
    [addOpenedTransform, setActiveTransform],
  );

  const applySuggestion = useCallback(
    async ({
      editorTransform,
      suggestedTransform,
    }: ApplySuggestionPayload): Promise<ApplySuggestionResult> => {
      const existingTransformId =
        typeof suggestedTransform.id === "number"
          ? suggestedTransform.id
          : undefined;

      // If editing an existing transform, fetch and open it
      if (existingTransformId != null) {
        const targetTransform: Transform | undefined =
          (editorTransform as Transform | undefined) ??
          (existingTransformId
            ? (suggestedTransform as unknown as Transform)
            : undefined);

        if (targetTransform) {
          openTaggedTransformInWorkspace(targetTransform);
          return { status: "applied" };
        }

        // Try to fetch the transform if we only have an ID
        try {
          const fetchedTransform =
            await getTransform(existingTransformId).unwrap();
          openTaggedTransformInWorkspace(fetchedTransform);
          return { status: "applied" };
        } catch {
          return {
            status: "error",
            message: t`Failed to load transform`,
          };
        }
      }

      // Creating a new transform
      if (!suggestedTransform.target) {
        return {
          status: "error",
          message: t`Suggestion is missing a target table`,
        };
      }

      const normalizedSource = normalizeSource(
        suggestedTransform.source,
        metadata,
      );

      const targetWithDatabase =
        suggestedTransform.target.type === "table"
          ? {
              ...suggestedTransform.target,
              database:
                suggestedTransform.target.database ??
                (normalizedSource.type === "query"
                  ? normalizedSource.query.database
                  : normalizedSource.type === "python"
                    ? normalizedSource["source-database"]
                    : undefined),
            }
          : suggestedTransform.target;

      if (
        targetWithDatabase.type === "table" &&
        targetWithDatabase.database == null
      ) {
        return {
          status: "error",
          message: t`Suggestion is missing a target database to create the transform.`,
        };
      }

      const sanitizedTarget =
        targetWithDatabase.type === "table"
          ? (() => {
              const fallbackName = slugify(suggestedTransform.name);
              const trimmedName =
                targetWithDatabase.name?.trim() || fallbackName;

              if (!trimmedName) {
                return null;
              }

              return {
                ...targetWithDatabase,
                name: trimmedName,
                schema:
                  targetWithDatabase.schema &&
                  targetWithDatabase.schema.trim() !== ""
                    ? targetWithDatabase.schema.trim()
                    : null,
              };
            })()
          : targetWithDatabase;

      if (sanitizedTarget === null) {
        return {
          status: "error",
          message: t`Suggestion is missing a target table name to create the transform.`,
        };
      }

      try {
        const transform = await createWorkspaceTransform({
          id: workspaceId,
          name: suggestedTransform.name,
          description: suggestedTransform.description ?? null,
          source: normalizedSource,
          target: sanitizedTarget,
        }).unwrap();

        openWorkspaceTransformInWorkspace(transform);
        return { status: "applied" };
      } catch {
        return {
          status: "error",
          message: t`Failed to create transform from suggestion`,
        };
      }
    },
    [
      metadata,
      workspaceId,
      createWorkspaceTransform,
      getTransform,
      openTaggedTransformInWorkspace,
      openWorkspaceTransformInWorkspace,
    ],
  );

  const openTransform = useCallback(
    (nextTransform: { type: "transform" } & Transform) => {
      addOpenedTransform(nextTransform);
      setActiveTransform(nextTransform);
    },
    [addOpenedTransform, setActiveTransform],
  );

  const suggestionActions = useMemo<MetabotSuggestionActions>(
    () => ({
      openTransform,
      applySuggestion,
    }),
    [openTransform, applySuggestion],
  );

  useRegisterMetabotSuggestionActions(suggestionActions);

  // Keep metabotStateRef in sync
  useEffect(() => {
    metabotStateRef.current = metabotState;
  }, [metabotState]);

  // Register database context provider for Metabot
  useRegisterMetabotContextProvider(async () => {
    if (!databaseId) {
      return;
    }
    return { default_database_id: databaseId };
  }, [databaseId]);

  // Switch to metabot tab when metabot becomes visible
  useEffect(() => {
    if (isMetabotAvailable && isMetabotVisible) {
      setTab("metabot");
      setActiveTab(undefined);
    }
  }, [isMetabotAvailable, isMetabotVisible, setActiveTab, setTab]);

  // Clear metabot context when the associated transform tab is closed
  useEffect(() => {
    if (
      metabotContextTransform &&
      !openedTabs.some(
        (tab) =>
          tab.type === "transform" &&
          getTransformId(tab.transform) ===
            getTransformId(metabotContextTransform),
      )
    ) {
      setMetabotContextTransform(undefined);
      setMetabotContextSource(undefined);
    }
  }, [openedTabs, metabotContextTransform]);

  // Restore/save metabot conversation snapshots per workspace
  useEffect(() => {
    const snapshots = metabotSnapshots.current;
    const snapshot = snapshots.get(workspaceId);
    if (snapshot) {
      dispatch(metabotActions.setConversationSnapshot(snapshot));
    } else {
      resetMetabotConversation();
    }

    return () => {
      const convo = metabotStateRef.current.conversations["omnibot"];
      if (convo) {
        snapshots.set(workspaceId, {
          messages: convo.messages,
          history: convo.history,
          state: convo.state,
          activeToolCalls: convo.activeToolCalls,
          errorMessages: convo.errorMessages,
          conversationId: convo.conversationId,
          suggestedTransforms:
            metabotStateRef.current.reactions.suggestedTransforms,
        });
      }
      resetMetabotConversation();
    };
  }, [workspaceId, dispatch, resetMetabotConversation]);

  // Handle metabot navigation reactions
  useEffect(() => {
    if (!navigateToPath) {
      return;
    }

    const transformIdFromPath = (() => {
      const match = navigateToPath.match(/\/transform\/(\d+)/);
      const extracted = Urls.extractEntityId(navigateToPath);
      const idString = match?.[1] ?? (extracted ? String(extracted) : null);
      const parsed = idString ? Number(idString) : NaN;
      return Number.isFinite(parsed) ? parsed : undefined;
    })();

    if (transformIdFromPath != null) {
      // Check if transform exists in local workspace state first (already opened/unsaved)
      const localTransform = allTransforms.find(
        (t: UnsavedTransform | WorkspaceTransformListItem) => {
          if (isUnsavedTransform(t)) {
            return t.id === transformIdFromPath;
          }
          return t.ref_id === String(transformIdFromPath);
        },
      );

      if (localTransform && !isUnsavedTransform(localTransform)) {
        // For WorkspaceTransformListItem, we need to navigate to fetch full data
        handleNavigateToTransform(transformIdFromPath);
        setNavigateToPath(null);
        return;
      }

      // Unsaved transforms are already opened when created, so just activate the tab
      if (localTransform && isUnsavedTransform(localTransform)) {
        // Find the existing tab and activate it
        const existingTab = openedTabs.find(
          (tab) =>
            tab.type === "transform" &&
            getTransformId(tab.transform) === localTransform.id,
        );
        if (existingTab) {
          setActiveTab(existingTab);
        }
        setNavigateToPath(null);
        return;
      }

      // Otherwise fetch and open the transform
      handleNavigateToTransform(transformIdFromPath);
      setNavigateToPath(null);
      return;
    }

    dispatch(push(navigateToPath));
    setNavigateToPath(null);
  }, [
    navigateToPath,
    allTransforms,
    openedTabs,
    setActiveTab,
    setNavigateToPath,
    handleNavigateToTransform,
    dispatch,
  ]);

  return {
    isMetabotAvailable,
    metabotContextTransform,
    metabotContextSource,
    setMetabotContextTransform,
    setMetabotContextSource,
  };
}
