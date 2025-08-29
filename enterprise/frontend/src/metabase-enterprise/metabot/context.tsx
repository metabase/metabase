import dayjs from "dayjs";
import type React from "react";
import { createContext, useCallback, useRef, useState } from "react";
import _ from "underscore";

import { useLazyListDatabasesQuery } from "metabase/api";
import { useStore } from "metabase/lib/redux";
import type {
  ChatContextProviderFn,
  MetabotContext as MetabotCtx,
} from "metabase/metabot";
import { getHasDataAccess, getHasNativeWrite } from "metabase/selectors/data";

export const defaultContext = {
  prompt: "",
  setPrompt: () => {},
  promptInputRef: undefined,

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
  /* Metabot input */
  const [prompt, setPrompt] = useState("");
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  /* Metabot context */
  const providerFnsRef = useRef<Set<ChatContextProviderFn>>(new Set());
  const store = useStore();

  const [listDbs] = useLazyListDatabasesQuery();

  const getChatContext = useCallback(async () => {
    const state = store.getState();
    const providerFns = [...providerFnsRef.current];

    const { data: dbData } = await listDbs(undefined, true);
    const databases = dbData?.data ?? [];
    const hasDataAccess = getHasDataAccess(databases);
    const hasNativeWrite = getHasNativeWrite(databases);

    const ctx = {
      user_is_viewing: [],
      current_time_with_timezone: dayjs.tz(dayjs()).format(),
      capabilities: _.compact([
        "frontend:navigate_user_v1",
        hasDataAccess && "permission:save_questions",
        hasNativeWrite && "permission:write_sql_queries",
      ]),
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
  }, [store, listDbs]);

  const registerChatContextProvider = useCallback(
    (providerFn: ChatContextProviderFn) => {
      providerFnsRef.current.add(providerFn);
      return () => providerFnsRef.current.delete(providerFn);
    },
    [],
  );

  return (
    <MetabotContext.Provider
      value={{
        prompt,
        setPrompt,
        promptInputRef,
        getChatContext,
        registerChatContextProvider,
      }}
    >
      {children}
    </MetabotContext.Provider>
  );
};
