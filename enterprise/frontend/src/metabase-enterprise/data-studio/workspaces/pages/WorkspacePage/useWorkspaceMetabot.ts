import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useLazyGetTransformQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { PLUGIN_METABOT } from "metabase/plugins";
import { getIsWorkspace } from "metabase/selectors/routing";
import { METABOT_PROFILE_OVERRIDES } from "metabase-enterprise/metabot/constants";
import type {
  ApplySuggestionPayload,
  ApplySuggestionResult,
  MetabotSuggestionActions,
} from "metabase-enterprise/metabot/context";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks/use-metabot-agent";
import { useMetabotReactions } from "metabase-enterprise/metabot/hooks/use-metabot-reactions";
import type {
  MetabotConverstationState,
  MetabotState,
} from "metabase-enterprise/metabot/state";
import {
  activateSuggestedTransform,
  updateSuggestedTransformId,
} from "metabase-enterprise/metabot/state/actions";
import { metabotActions } from "metabase-enterprise/metabot/state/reducer";
import { getMetabotState } from "metabase-enterprise/metabot/state/selectors";
import { useEnterpriseSelector } from "metabase-enterprise/redux";
import type {
  DatabaseId,
  DraftTransformSource,
  MetabotSuggestedTransform,
  TaggedTransform,
  Transform,
  UnsavedTransform,
  WorkspaceTransformListItem,
} from "metabase-types/api";
import { isUnsavedTransform } from "metabase-types/api";

import {
  type AnyWorkspaceTransform,
  getTransformId,
  getTransformTabId,
  useWorkspace,
} from "./WorkspaceProvider";
import { isSavedTransformInfo } from "./utils/guards";
import {
  getDatabaseIdFromSource,
  setDatabaseIdOnSource,
} from "./utils/transform-source";

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
  suggestionActions: MetabotSuggestionActions;
};

export function useWorkspaceMetabot({
  workspaceId,
  databaseId,
  allTransforms,
  setTab,
  handleNavigateToTransform,
}: UseWorkspaceMetabotParams): UseWorkspaceMetabotReturn {
  const dispatch = useDispatch();
  const isWorkspace = useEnterpriseSelector(getIsWorkspace);
  const {
    openedTabs,
    setActiveTab,
    addOpenedTransform,
    setActiveTransform,
    addUnsavedTransform,
    unsavedTransforms,
    patchEditedTransform,
  } = useWorkspace();

  const isMetabotAvailable = PLUGIN_METABOT.isEnabled();
  const { navigateToPath, setNavigateToPath } = useMetabotReactions();
  const {
    resetConversation: resetMetabotConversation,
    visible: isMetabotVisible,
    setProfileOverride,
  } = useMetabotAgent();

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
      const taggedTransform: TaggedTransform = {
        ...nextTransform,
        type: "transform",
      };
      addOpenedTransform(taggedTransform);
      setActiveTransform(taggedTransform);
      setTab(getTransformTabId(taggedTransform));
    },
    [addOpenedTransform, setActiveTransform, setTab],
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
        const targetTransform = isSavedTransformInfo(editorTransform)
          ? editorTransform
          : isSavedTransformInfo(suggestedTransform)
            ? suggestedTransform
            : undefined;

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

      // Creating a new transform - create unsaved transform first, then associate suggestion
      if (!suggestedTransform.target) {
        return {
          status: "error",
          message: t`Suggestion is missing a target table`,
        };
      }

      const dbId = getDatabaseIdFromSource(
        suggestedTransform.source,
        databaseId,
      );
      const sourceWithDatabase = setDatabaseIdOnSource(
        suggestedTransform.source,
        dbId,
      );

      const suggestionId = suggestedTransform.suggestionId;
      if (!suggestionId) {
        return {
          status: "error",
          message: t`Suggestion is missing an ID`,
        };
      }

      // Get the count of unsaved transforms before creating a new one
      // This will be used to calculate the ID of the new transform
      const previousUnsavedCount = unsavedTransforms.length;

      // Create unsaved transform with the suggested source
      // This will automatically open the transform tab and set it as active
      addUnsavedTransform(sourceWithDatabase);

      // Calculate the expected ID of the newly created unsaved transform
      // Based on addUnsavedTransform implementation: id = -1 - currentIndex
      const expectedId = -1 - previousUnsavedCount;

      // Update the suggested transform's ID to match the unsaved transform
      // This associates the suggestion with the transform so apply/reject buttons show
      dispatch(
        updateSuggestedTransformId({
          suggestionId,
          newId: expectedId,
        }),
      );

      // Activate the suggested transform so it shows as active in the UI
      dispatch(
        activateSuggestedTransform({
          id: expectedId,
          suggestionId,
        }),
      );

      // Update the transform name to match the suggestion
      patchEditedTransform(expectedId, {
        name: suggestedTransform.name,
      });

      return { status: "applied" };
    },
    [
      databaseId,
      unsavedTransforms,
      addUnsavedTransform,
      patchEditedTransform,
      dispatch,
      getTransform,
      openTaggedTransformInWorkspace,
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
      setActiveTab(null);
    }
  }, [isMetabotAvailable, isMetabotVisible, setActiveTab, setTab]);

  // Clear metabot context when the associated transform tab is closed
  useEffect(() => {
    if (
      metabotContextTransform &&
      !openedTabs.some(
        (tab) =>
          tab.type === "transform" &&
          getTransformId(tab.transformRef) ===
            getTransformId(metabotContextTransform),
      )
    ) {
      setMetabotContextTransform(undefined);
      setMetabotContextSource(undefined);
    }
  }, [openedTabs, metabotContextTransform]);

  // Set profile override to transforms_codegen for workspace metabot
  useEffect(() => {
    if (isMetabotAvailable) {
      setProfileOverride(METABOT_PROFILE_OVERRIDES.TRANSFORMS_CODEGEN);
    }
  }, [isMetabotAvailable, isMetabotVisible, setProfileOverride]);

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
            getTransformId(tab.transformRef) === localTransform.id,
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

    // In workspace context, don't redirect to question pages
    // The profile override should prevent most navigate_to chunks,
    // but if one slips through, we'll just ignore it
    if (isWorkspace) {
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
    isWorkspace,
  ]);

  return {
    isMetabotAvailable,
    metabotContextTransform,
    metabotContextSource,
    setMetabotContextTransform,
    setMetabotContextSource,
    suggestionActions,
  };
}
