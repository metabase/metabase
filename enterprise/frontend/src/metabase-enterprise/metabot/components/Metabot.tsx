import { useEffect, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import MetabotFailure from "assets/img/metabot-failure.svg?component";
import ErrorBoundary from "metabase/ErrorBoundary";
import { useSelector } from "metabase/lib/redux";
import { Sidebar } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { getUser } from "metabase/selectors/user";
import { Box, Button, Flex, Text } from "metabase/ui";

import { trackMetabotChatOpened } from "../analytics";
import { useMetabotAgent } from "../hooks";
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
        <Text c="text-tertiary" maw="12rem" ta="center">
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

// TODO: add test coverage for these
export interface MetabotConfig {
  agentId?: MetabotAgentId;
  emptyText?: string;
  hideSuggestedPrompts?: boolean;
  preventClose?: boolean;
  preventRetryMessage?: boolean;
  suggestionModels: SuggestionModel[];
}

export interface MetabotProps {
  hide?: boolean;
  config?: MetabotConfig;
}

export const MetabotAuthenticated = ({ hide, config }: MetabotProps) => {
  const { visible, setVisible } = useMetabotAgent(config?.agentId ?? "omnibot");
  const [errorBoundaryKey, setErrorBoundaryKey] = useState(0);

  const handleRetry = () => setErrorBoundaryKey((prev) => prev + 1);

  useEffect(() => {
    return tinykeys(window, {
      "$mod+e": (e) => {
        e.preventDefault(); // prevent FF from opening bookmark menu
        if (!visible) {
          trackMetabotChatOpened("keyboard_shortcut");
        }
        setVisible(!visible);
      },
    });
  }, [visible, setVisible]);

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
        <MetabotChat config={config} />
      </Sidebar>
    </ErrorBoundary>
  );
};

export const Metabot = (props: MetabotProps) => {
  const currentUser = useSelector(getUser);

  // NOTE: do not render Metabot if the user is not authenticated.
  // doing so will cause a redirect for unauthenticated requests
  // which will break interactive embedding. See (metabase#58687).
  if (!currentUser) {
    return null;
  }

  return <MetabotAuthenticated {...props} />;
};
