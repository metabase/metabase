import { useCallback, useEffect, useRef, useState } from "react";
import { push, replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { PLUGIN_METABOT } from "metabase/plugins";
import {
  useLazyGetTransformQuery,
  useLazyGetWorkspaceTransformQuery,
} from "metabase-enterprise/api";
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
import type {
  DatabaseId,
  DraftTransformSource,
  ExternalTransform,
  Transform,
  WorkspaceTransformItem,
} from "metabase-types/api";

import type { WorkspaceTab } from "./WorkspaceProvider";

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
  workspaceTransforms: WorkspaceTransformItem[];
  availableTransforms: ExternalTransform[];
  allTransforms: (Transform | WorkspaceTransformItem)[];
  openedTabs: WorkspaceTab[];
  setTab: (tab: string) => void;
  setActiveTab: (tab: WorkspaceTab | undefined) => void;
  addOpenedTransform: (transform: Transform | WorkspaceTransformItem) => void;
  setActiveTransform: (
    transform: Transform | WorkspaceTransformItem | undefined,
  ) => void;
  sendErrorToast: (message: string) => void;
};

type UseWorkspaceMetabotReturn = {
  isMetabotAvailable: boolean;
  metabotContextTransform: Transform | undefined;
  metabotContextSource: DraftTransformSource | undefined;
  setMetabotContextTransform: (transform: Transform | undefined) => void;
  setMetabotContextSource: (source: DraftTransformSource | undefined) => void;
  handleNavigateToTransform: (transformId: number) => void;
};

export function useWorkspaceMetabot({
  workspaceId,
  databaseId,
  transformId,
  isLoading,
  workspaceTransforms,
  availableTransforms,
  allTransforms,
  openedTabs,
  setTab,
  setActiveTab,
  addOpenedTransform,
  setActiveTransform,
  sendErrorToast,
}: UseWorkspaceMetabotParams): UseWorkspaceMetabotReturn {
  const dispatch = useDispatch();
  const isMetabotAvailable = PLUGIN_METABOT.isEnabled();

  const { navigateToPath, setNavigateToPath } = useMetabotReactions();
  const {
    resetConversation: resetMetabotConversation,
    visible: isMetabotVisible,
  } = useMetabotAgent();

  const metabotState = useEnterpriseSelector(getMetabotState);
  const metabotStateRef = useRef<MetabotState>(metabotState);
  const metabotSnapshots = useRef<Map<number, MetabotConversationSnapshot>>(
    new Map(),
  );

  const [fetchTransform] = useLazyGetTransformQuery();
  const [fetchWorkspaceTransform] = useLazyGetWorkspaceTransformQuery();

  const [metabotContextTransform, setMetabotContextTransform] = useState<
    Transform | undefined
  >();
  const [metabotContextSource, setMetabotContextSource] = useState<
    DraftTransformSource | undefined
  >();

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
          tab.transform.id === metabotContextTransform.id,
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

  // Callback to navigate to a transform (used by metabot reactions and URL param)
  const handleNavigateToTransform = useCallback(
    async (targetTransformId: number) => {
      const transform = [...workspaceTransforms, ...availableTransforms].find(
        (transform) => {
          if ("global_id" in transform) {
            return transform.global_id === targetTransformId;
          }
          return transform.id === targetTransformId;
        },
      );

      const isWsTransform = !!transform && "global_id" in transform;

      if (transform && !isWsTransform) {
        const { data } = await fetchTransform(transform.id, true);
        if (data) {
          addOpenedTransform(data);
          setActiveTransform(data);
          setTab(String(targetTransformId));
        }
      } else if (transform && isWsTransform) {
        const { data } = await fetchWorkspaceTransform({
          workspaceId,
          transformId: transform.ref_id,
        });
        if (data) {
          addOpenedTransform(data);
          setActiveTransform(data);
          setTab(String(targetTransformId));
        }
      } else {
        sendErrorToast(`Transform ${targetTransformId} not found`);
      }
    },
    [
      workspaceTransforms,
      availableTransforms,
      workspaceId,
      fetchTransform,
      fetchWorkspaceTransform,
      addOpenedTransform,
      setActiveTransform,
      setTab,
      sendErrorToast,
    ],
  );

  // Handle transformId URL param - initialize transform tab if redirected from transform page
  useEffect(() => {
    if (!transformId || isLoading) {
      return;
    }

    (async () => {
      await handleNavigateToTransform(Number(transformId));
      dispatch(replace(Urls.dataStudioWorkspace(workspaceId)));
    })();
  }, [
    transformId,
    isLoading,
    workspaceId,
    handleNavigateToTransform,
    dispatch,
  ]);

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
        (t: Transform | WorkspaceTransformItem) =>
          ("id" in t && t.id === transformIdFromPath) ||
          ("ref_id" in t && t.ref_id === String(transformIdFromPath)),
      );

      if (localTransform) {
        addOpenedTransform(localTransform);
        setActiveTransform(localTransform);
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
    addOpenedTransform,
    setActiveTransform,
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
    handleNavigateToTransform,
  };
}
