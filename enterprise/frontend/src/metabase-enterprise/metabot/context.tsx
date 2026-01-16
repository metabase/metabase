import dayjs from "dayjs";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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
import type {
  MetabotChatContext,
  MetabotTransformInfo,
  TaggedTransform,
} from "metabase-types/api";

import type { MetabotSuggestedTransform } from "./state";

export type ApplySuggestionPayload = {
  editorTransform: MetabotTransformInfo | undefined;
  suggestedTransform: MetabotSuggestedTransform;
};

export type ApplySuggestionResult =
  | { status: "applied" }
  | { status: "error"; message: string };

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

export type MetabotSuggestionActions = {
  openTransform: (transform: TaggedTransform) => void;
  applySuggestion: (
    payload: ApplySuggestionPayload,
  ) => Promise<ApplySuggestionResult>;
};

const defaultSuggestionActions: MetabotSuggestionActions | null = null;

export const MetabotSuggestionActionsContext =
  createContext<MetabotSuggestionActions | null>(defaultSuggestionActions);

const MetabotSuggestionActionsSetterContext = createContext<
  (actions: MetabotSuggestionActions | null) => void
>(() => {});
const MetabotSuggestionActionsOwnerContext = createContext(false);

export const useMetabotSuggestionActions = () => {
  return useContext(MetabotSuggestionActionsContext);
};

export const useRegisterMetabotSuggestionActions = (
  actions: MetabotSuggestionActions,
) => {
  const setActions = useContext(MetabotSuggestionActionsSetterContext);

  useEffect(() => {
    setActions(actions);
    return () => setActions(null);
  }, [actions, setActions]);
};

export const MetabotProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const hasSuggestionActionsOwner = useContext(
    MetabotSuggestionActionsOwnerContext,
  );
  /* Metabot input */
  const [prompt, setPrompt] = useState("");
  const promptInputRef = useRef<MetabotPromptInputRef>(null);
  const [suggestionActions, setSuggestionActions] =
    useState<MetabotSuggestionActions | null>(defaultSuggestionActions);

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
      {hasSuggestionActionsOwner ? (
        children
      ) : (
        <MetabotSuggestionActionsOwnerContext.Provider value={true}>
          <MetabotSuggestionActionsSetterContext.Provider
            value={setSuggestionActions}
          >
            <MetabotSuggestionActionsContext.Provider value={suggestionActions}>
              {children}
            </MetabotSuggestionActionsContext.Provider>
          </MetabotSuggestionActionsSetterContext.Provider>
        </MetabotSuggestionActionsOwnerContext.Provider>
      )}
    </MetabotContext.Provider>
  );
};
