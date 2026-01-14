import { useEffect, useRef, useState } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { PLUGIN_METABOT } from "metabase/plugins";
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
  Transform,
  WorkspaceTransformItem,
} from "metabase-types/api";

import { useWorkspace } from "./WorkspaceProvider";

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
  allTransforms: (Transform | WorkspaceTransformItem)[];
  setTab: (tab: string) => void;
  handleNavigateToTransform: (transformId: number) => void;
};

type UseWorkspaceMetabotReturn = {
  isMetabotAvailable: boolean;
  metabotContextTransform: Transform | undefined;
  metabotContextSource: DraftTransformSource | undefined;
  setMetabotContextTransform: (transform: Transform | undefined) => void;
  setMetabotContextSource: (source: DraftTransformSource | undefined) => void;
};

export function useWorkspaceMetabot({
  workspaceId,
  databaseId,
  transformId,
  isLoading,
  allTransforms,
  setTab,
  handleNavigateToTransform,
}: UseWorkspaceMetabotParams): UseWorkspaceMetabotReturn {
  const dispatch = useDispatch();
  const { addOpenedTransform, openedTabs, setActiveTab, setActiveTransform } = useWorkspace();

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
  };
}
