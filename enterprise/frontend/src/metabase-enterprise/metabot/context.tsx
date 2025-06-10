import dayjs from "dayjs";
import type React from "react";
import { createContext, useCallback, useRef } from "react";

import { useStore } from "metabase/lib/redux";
import type {
  ChatContextProviderFn,
  MetabotContext as MetabotCtx,
} from "metabase/metabot";

export const defaultContext = {
  getChatContext: () =>
    Promise.resolve({
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

  const getChatContext = useCallback(async () => {
    const state = store.getState();
    const providerFns = [...providerFnsRef.current];

    const ctx = {
      user_is_viewing: [],
      current_time_with_timezone: dayjs.tz(dayjs()).format(),
    };

    for (const providerFn of providerFns) {
      try {
        const partialCtx = await providerFn(state);
        return Object.assign(ctx, partialCtx);
      } catch (err) {
        console.error("A metabot chat context provider failed:", err);
      }
    }

    return ctx;
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
