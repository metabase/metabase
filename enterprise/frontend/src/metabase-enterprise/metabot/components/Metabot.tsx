import { useEffect } from "react";
import { tinykeys } from "tinykeys";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useSelector } from "metabase/lib/redux";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { getUser } from "metabase/selectors/user";

import { trackMetabotChatOpened } from "../analytics";
import { useMetabotAgent } from "../hooks";
import type { MetabotAgentId } from "../state";

import { MetabotChat } from "./MetabotChat";

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

  return (
    <ErrorBoundary errorComponent={() => null}>
      <MetabotChat config={config} />
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
