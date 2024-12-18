import dayjs from "dayjs";
import type React from "react";
import { createContext, useCallback, useRef } from "react";

import { useStore } from "metabase/lib/redux";
import type {
  ChatContextProviderFn,
  MetabotContext as MetabotCtx,
} from "metabase/metabot";

export const defaultContext = {
  getChatContext: () => ({
    user_is_viewing: [],
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
  const providerFnsRef = useRef<Set<ChatContextProviderFn>>(new Set());
  const store = useStore();

  const getChatContext = useCallback(() => {
    const state = store.getState();

    const baseContext = {
      user_is_viewing: [],
      current_time_with_timezone: dayjs.tz(dayjs()).format(),
    };

    return [...providerFnsRef.current].reduce((chatContext, providerFn) => {
      try {
        const partialContext = providerFn(state) || {};
        return Object.assign(chatContext, partialContext);
      } catch (err) {
        console.error("A metabot chat context provider failed:", err);
        return chatContext;
      }
    }, baseContext);
  }, [store]);

  const registerChatContextProvider = useCallback(
    (providerFn: ChatContextProviderFn) => {
      providerFnsRef.current.add(providerFn);
      return () => providerFnsRef.current.delete(providerFn);
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
