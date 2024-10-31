import dayjs from "dayjs";
import type React from "react";
import { createContext, useCallback, useState } from "react";

import { useStore } from "metabase/lib/redux";
import type {
  ChatContextProviderFn,
  MetabotContext as MetabotCtx,
} from "metabase/metabot";

export const defaultContext = {
  getChatContext: () => ({
    current_time_with_timezone: dayjs.tz(dayjs()).format(),
  }),
  registerChatContextProvider: () => () => {},
};

export const MetabotContext = createContext<MetabotCtx>(defaultContext);

export const MetabotProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [providerFns, setProviderFns] = useState<ChatContextProviderFn[]>([]);
  const store = useStore();

  const getChatContext = useCallback(() => {
    const state = store.getState();

    const baseContext = {
      current_time_with_timezone: dayjs.tz(dayjs()).format(),
    };

    return providerFns.reduce((chatContext, providerFn) => {
      try {
        const partialContext = providerFn(state) || {};
        return Object.assign(chatContext, partialContext);
      } catch (err) {
        console.error("A metabot chat context provider failed:", err);
        return chatContext;
      }
    }, baseContext);
  }, [providerFns, store]);

  const registerChatContextProvider = useCallback(
    (providerFn: ChatContextProviderFn) => {
      setProviderFns(providerFns => [...providerFns, providerFn]);
      return () => setProviderFns(fns => fns.filter(fn => fn === providerFn));
    },
    [],
  );

  return (
    <MetabotContext.Provider
      value={{ getChatContext, registerChatContextProvider }}
    >
      {children}
    </MetabotContext.Provider>
  );
};
