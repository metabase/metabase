import { type RefObject, useContext, useEffect, useMemo } from "react";

import { PLUGIN_METABOT } from "metabase/plugins";
import type { MetabotChatContext } from "metabase-types/api";
import type { State } from "metabase-types/store";

export type ChatContextProviderFn = (
  state: State,
) => Promise<Partial<MetabotChatContext> | void>;

export type DeregisterChatContextProviderFn = () => void;

// internal type so we can support tiptap editor and textarea as inputs
export type MetabotPromptInputRef = {
  focus: () => void;
  getValue?: () => string;
  scrollHeight: number;
  scrollTop: number;
};

export interface MetabotContext {
  prompt: string;
  setPrompt: (prompt: string) => void;
  promptInputRef: RefObject<MetabotPromptInputRef> | undefined;

  getChatContext: () => Promise<MetabotChatContext>;
  registerChatContextProvider: (
    fn: ChatContextProviderFn,
  ) => DeregisterChatContextProviderFn;

  suggestionActions: unknown;
  setSuggestionActions: (actions: unknown) => void;
}

export const useMetabotContext = () => {
  const context = useContext(PLUGIN_METABOT.MetabotContext);
  if (!context) {
    throw new Error("useMetabotContext must be used within a MetabotProvider");
  }

  return context;
};

export const useRegisterMetabotContextProvider = (
  providerFn: ChatContextProviderFn,
  dependencies: React.DependencyList = [],
) => {
  const { registerChatContextProvider } = useMetabotContext();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cachedProviderFn = useMemo(() => providerFn, dependencies);

  useEffect(() => {
    const deregister = registerChatContextProvider(cachedProviderFn);
    return () => deregister();
  }, [cachedProviderFn, registerChatContextProvider]);
};
