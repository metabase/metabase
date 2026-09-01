import { Suspense, useEffect, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import MetabotFailure from "assets/img/metabot-failure.svg?component";
import ErrorBoundary from "metabase/ErrorBoundary";
import { idTag } from "metabase/api/tags";
import { getUser } from "metabase/current-user";
import {
  useIsFullPageMetabot,
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { Sidebar } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { useDispatch, useSelector } from "metabase/redux";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Text,
  Tooltip,
} from "metabase/ui";

import { trackMetabotChatOpened } from "../analytics";
import { metabotApi } from "../api";
import { isHistoryEnabledProfile } from "../constants";
import type { MetabotAgentId } from "../state";

import { MetabotConversationHistory } from "./MetabotChat/MetabotConversationHistory";
import { createLazyMetabotChat, prefetchMetabotChat } from "./MetabotChat/lazy";

const MetabotErrorFallback = ({ onRetry }: { onRetry: () => void }) => {
  return (
    <Sidebar isOpen side="right" width="30rem">
      <Flex
        h="100%"
        gap="md"
        direction="column"
        align="center"
        justify="center"
        data-testid="metabot-error-fallback"
      >
        <Box component={MetabotFailure} w="6rem" />
        <Text c="text-disabled" maw="12rem" ta="center">
          {t`Something went wrong.`}
        </Text>
        <Button
          variant="subtle"
          size="compact-lg"
          onClick={onRetry}
          data-testid="metabot-error-retry"
        >
          {t`Try again`}
        </Button>
      </Flex>
    </Sidebar>
  );
};

const MetabotSidebarActions = ({ agentId }: { agentId: MetabotAgentId }) => {
  const metabot = useMetabotAgent(agentId);
  const { isConfigured } = useUserMetabotPermissions();
  const dispatch = useDispatch();

  const handleNewConversation = () => {
    metabot.createNewConversation();
    dispatch(
      metabotApi.util.invalidateTags([
        idTag("metabot-prompt-suggestions", metabot.metabotId),
      ]),
    );
  };

  const handleCloseChat = () => {
    metabot.setPrompt("");
    metabot.setVisible(false);
  };

  return (
    <Flex gap="sm">
      {isConfigured && (
        <Tooltip label={t`New conversation`} position="bottom">
          <ActionIcon
            onClick={handleNewConversation}
            aria-label={t`New conversation`}
            data-testid="metabot-new-conversation"
          >
            <Icon c="text-primary" name="edit_document_outlined" size={16} />
          </ActionIcon>
        </Tooltip>
      )}
      {isConfigured && isHistoryEnabledProfile(metabot.profile) && (
        <MetabotConversationHistory
          profileId={metabot.profile}
          activeConversationId={metabot.conversationId}
          onConversationSelect={metabot.loadConversation}
        />
      )}
      <ActionIcon onClick={handleCloseChat} data-testid="metabot-close-chat">
        <Icon c="text-primary" name="close" />
      </ActionIcon>
    </Flex>
  );
};

// TODO: add test coverage for these
export interface MetabotChatConfig {
  emptyText?: string;
  hideSuggestedPrompts?: boolean;
  preventRetryMessage?: boolean;
  suggestionModels: SuggestionModel[];
}

export interface MetabotConfig extends MetabotChatConfig {
  agentId: MetabotAgentId;
}

export interface MetabotProps {
  hide?: boolean;
  config?: MetabotConfig;
}

export const MetabotAuthenticated = ({ hide, config }: MetabotProps) => {
  const agentId = config?.agentId ?? "omnibot";
  const { visible, setVisible, conversationId, createNewConversation } =
    useMetabotAgent(agentId);
  const [errorBoundaryKey, setErrorBoundaryKey] = useState(0);
  const [MetabotChat, setMetabotChat] = useState(createLazyMetabotChat);
  const isFullPageMetabot = useIsFullPageMetabot();

  const handleRetry = () => {
    // A failed fetch is one of the errors the boundary catches, and the panel
    // that failed can never load, so retry with a fresh one.
    setMetabotChat(createLazyMetabotChat());
    setErrorBoundaryKey((prev) => prev + 1);
  };

  useEffect(() => {
    return tinykeys(window, {
      "$mod+e": (e) => {
        e.preventDefault(); // prevent FF from opening bookmark menu
        if (isFullPageMetabot) {
          return;
        }
        if (!visible) {
          trackMetabotChatOpened("keyboard_shortcut");
        }
        setVisible(!visible);
      },
    });
  }, [visible, setVisible, isFullPageMetabot]);

  useEffect(function prefetchChatPanelWhenIdle() {
    if (typeof requestIdleCallback !== "function") {
      prefetchMetabotChat();
      return;
    }
    const handle = requestIdleCallback(prefetchMetabotChat);
    return () => cancelIdleCallback(handle);
  }, []);

  useEffect(
    function closeViaPropChange() {
      if (hide) {
        setVisible(false);
      }
    },
    [hide, setVisible],
  );

  if (!visible || hide) {
    return null;
  }

  const ErrorFallback = () => <MetabotErrorFallback onRetry={handleRetry} />;

  return (
    <ErrorBoundary key={errorBoundaryKey} errorComponent={ErrorFallback}>
      {/* The fallback covers the sidebar too, so an empty panel never opens */}
      <Suspense fallback={null}>
        <Sidebar
          isOpen={visible}
          side="right"
          width="30rem"
          aria-hidden={!visible}
        >
          <MetabotChat
            conversationId={conversationId}
            agentId={agentId}
            onNewConversation={createNewConversation}
            config={config}
            headerActions={<MetabotSidebarActions agentId={agentId} />}
          />
        </Sidebar>
      </Suspense>
    </ErrorBoundary>
  );
};

export const Metabot = (props: MetabotProps) => {
  const currentUser = useSelector(getUser);
  const { hasMetabotAccess } = useUserMetabotPermissions();

  // NOTE: do not render Metabot if the user is not authenticated.
  // doing so will cause a redirect for unauthenticated requests
  // which will break interactive embedding. See (metabase#58687).
  if (!currentUser || !hasMetabotAccess) {
    return null;
  }

  return <MetabotAuthenticated {...props} />;
};
