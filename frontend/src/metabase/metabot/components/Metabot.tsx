import { useEffect, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import MetabotFailure from "assets/img/metabot-failure.svg?component";
import ErrorBoundary from "metabase/ErrorBoundary";
import { metabotApi } from "metabase/api";
import { idTag } from "metabase/api/tags";
import {
  useIsAskPage,
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { Sidebar } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { useDispatch, useSelector } from "metabase/redux";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { getUser } from "metabase/selectors/user";
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
import type { MetabotAgentId } from "../state";

import { MetabotChat } from "./MetabotChat";

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

  const handleResetChat = () => {
    metabot.resetConversation();
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
        <Tooltip label={t`Clear conversation`} position="bottom">
          <ActionIcon
            onClick={handleResetChat}
            data-testid="metabot-reset-chat"
          >
            <Icon c="text-primary" name="revert" />
          </ActionIcon>
        </Tooltip>
      )}
      <ActionIcon onClick={handleCloseChat} data-testid="metabot-close-chat">
        <Icon c="text-primary" name="close" />
      </ActionIcon>
    </Flex>
  );
};

// TODO: add test coverage for these
export interface MetabotConfig {
  agentId?: MetabotAgentId;
  emptyText?: string;
  hideSuggestedPrompts?: boolean;
  preventRetryMessage?: boolean;
  suggestionModels: SuggestionModel[];
}

export interface MetabotProps {
  hide?: boolean;
  config?: MetabotConfig;
}

export const MetabotAuthenticated = ({ hide, config }: MetabotProps) => {
  const agentId = config?.agentId ?? "omnibot";
  const { visible, setVisible } = useMetabotAgent(agentId);
  const [errorBoundaryKey, setErrorBoundaryKey] = useState(0);
  const isAskPage = useIsAskPage();

  const handleRetry = () => setErrorBoundaryKey((prev) => prev + 1);

  useEffect(() => {
    return tinykeys(window, {
      "$mod+e": (e) => {
        e.preventDefault(); // prevent FF from opening bookmark menu
        if (isAskPage) {
          return;
        }
        if (!visible) {
          trackMetabotChatOpened("keyboard_shortcut");
        }
        setVisible(!visible);
      },
    });
  }, [visible, setVisible, isAskPage]);

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
      <Sidebar
        isOpen={visible}
        side="right"
        width="30rem"
        aria-hidden={!visible}
      >
        <MetabotChat
          config={config}
          headerActions={<MetabotSidebarActions agentId={agentId} />}
        />
      </Sidebar>
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
