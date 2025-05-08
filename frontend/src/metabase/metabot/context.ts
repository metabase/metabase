import { useContext, useEffect, useMemo } from "react";

import { PLUGIN_METABOT } from "metabase/plugins";
import type { MetabotChatContext } from "metabase-types/api";
import type { State } from "metabase-types/store";

export type ChatContextProviderFn = (
  state: State,
) => Partial<MetabotChatContext> | void;
export type DeregisterChatContextProviderFn = () => void;
export interface MetabotContext {
  getChatContext: () => MetabotChatContext;
  registerChatContextProvider: (
    fn: ChatContextProviderFn,
  ) => DeregisterChatContextProviderFn;
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
