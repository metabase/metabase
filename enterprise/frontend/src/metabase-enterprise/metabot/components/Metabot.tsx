import { useEffect, useMemo } from "react";
import { tinykeys } from "tinykeys";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { getUser } from "metabase/selectors/user";

import { trackMetabotChatOpened } from "../analytics";
import { METABOT_USE_CASES } from "../constants";
import { useMetabotAgent } from "../hooks";

import { MetabotChat } from "./MetabotChat";

// TODO: add test coverage for these
export interface MetabotConfig {
  emptyText?: string;
  hideSuggestedPrompts?: boolean;
  preventClose?: boolean;
  preventRetryMessage?: boolean;
  suggestionModels: SuggestionModel[];
}

export const DEFAULT_USE_CASES = [
  METABOT_USE_CASES.SQL,
  METABOT_USE_CASES.NLQ,
  METABOT_USE_CASES.OMNIBOT,
];

export interface MetabotProps {
  hide?: boolean;
  config?: MetabotConfig;
  /** Use cases that must be enabled for the sidebar to be available. Defaults to sql, nlq, omnibot. */
  requiredUseCases?: string[];
}

export const MetabotAuthenticated = ({
  hide,
  config,
  requiredUseCases = DEFAULT_USE_CASES,
}: MetabotProps) => {
  const { visible, setVisible } = useMetabotAgent();
  const enabledUseCases = useSetting("metabot-enabled-use-cases");
  const hasRequiredUseCase = useMemo(
    () =>
      requiredUseCases.some((useCase) => enabledUseCases?.includes(useCase)),
    [enabledUseCases, requiredUseCases],
  );

  useEffect(() => {
    return tinykeys(window, {
      "$mod+e": (e) => {
        e.preventDefault(); // prevent FF from opening bookmark menu
        if (!hasRequiredUseCase) {
          return;
        }
        if (!visible) {
          trackMetabotChatOpened("keyboard_shortcut");
        }
        setVisible(!visible);
      },
    });
  }, [visible, setVisible, hasRequiredUseCase]);

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
