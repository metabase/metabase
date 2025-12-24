import dayjs from "dayjs";
import type React from "react";
import { createContext, useCallback, useRef, useState } from "react";
import _ from "underscore";

import { useStore } from "metabase/lib/redux";
import type {
  ChatContextProviderFn,
  MetabotContext as MetabotCtx,
  MetabotPromptInputRef,
} from "metabase/metabot";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
  getUserIsAdmin,
} from "metabase/selectors/user";
import type { MetabotChatContext } from "metabase-types/api";

export const defaultContext = {
  prompt: "",
  setPrompt: () => {},
  promptInputRef: undefined,

  getChatContext: () =>
    Promise.resolve({
      user_is_viewing: [],
      current_time_with_timezone: dayjs.tz(dayjs()).format(),
      capabilities: [],
    }),
  registerChatContextProvider: () => () => {},
};

const mergeCtx = (
  ctx: MetabotChatContext,
  partialCtx: Partial<MetabotChatContext>,
): MetabotChatContext => {
  return {
    ...ctx,
    ...partialCtx,
    user_is_viewing: partialCtx.user_is_viewing
      ? [...ctx.user_is_viewing, ...partialCtx.user_is_viewing]
      : ctx.user_is_viewing,
  };
};

export const MetabotContext = createContext<MetabotCtx>(defaultContext);

export const MetabotProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  /* Metabot input */
  const [prompt, setPrompt] = useState("");
  const promptInputRef = useRef<MetabotPromptInputRef>(null);

  /* Metabot context */
  const providerFnsRef = useRef<Set<ChatContextProviderFn>>(new Set());
  const store = useStore();

  const getChatContext = useCallback(async () => {
    const state = store.getState();
    const providerFns = [...providerFnsRef.current];

    const isAdmin = getUserIsAdmin(state);
    const hasDataAccess = canUserCreateQueries(state);
    const hasNativeWrite = canUserCreateNativeQueries(state);

    let ctx: MetabotChatContext = {
      user_is_viewing: [],
      current_time_with_timezone: dayjs.tz(dayjs()).format(),
      capabilities: _.compact([
        "frontend:navigate_user_v1",
        hasDataAccess && "permission:save_questions",
        hasNativeWrite && "permission:write_sql_queries",
        isAdmin && "permission:write_transforms",
      ]) as string[],
    };

    for (const providerFn of providerFns) {
      try {
        const partialCtx = await providerFn(state);
        if (partialCtx) {
          ctx = mergeCtx(ctx, partialCtx);
        }
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
