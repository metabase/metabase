import type React from "react";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import _ from "underscore";

import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/current-user";
import { dayjs } from "metabase/dayjs";
import { useStore } from "metabase/redux";
import type { State } from "metabase/redux/store";
import type { IconName, MetabotChatContext } from "metabase-types/api";

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

/** PROTOTYPE: the entity on the current page, shown as a prompt context token */
export type MetabotPageContextEntity = {
  key: string;
  name: string;
  icon: IconName;
};

export type MetabotCtx = {
  prompt: string;
  setPrompt: (prompt: string) => void;
  promptInputRef: RefObject<MetabotPromptInputRef | null> | undefined;

  getChatContext: () => Promise<MetabotChatContext>;
  registerChatContextProvider: (
    fn: ChatContextProviderFn,
  ) => DeregisterChatContextProviderFn;

  pageContextEntity: MetabotPageContextEntity | null;
  setPageContextEntity: Dispatch<
    SetStateAction<MetabotPageContextEntity | null>
  >;
};

export const defaultContext: MetabotCtx = {
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

  pageContextEntity: null,
  setPageContextEntity: () => {},
};

export const MetabotContext = createContext<MetabotCtx>(defaultContext);

export const useMetabotContext = () => {
  const context = useContext(MetabotContext);
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

/**
 * PROTOTYPE: publishes the entity on the current page while the caller is
 * mounted, so Metabot can show it as context. Pass `null` while it loads.
 */
export const useRegisterMetabotPageContextEntity = (
  entity: MetabotPageContextEntity | null,
) => {
  const { setPageContextEntity } = useMetabotContext();
  const key = entity?.key;
  const name = entity?.name;
  const icon = entity?.icon;

  useEffect(() => {
    if (key == null || name == null || icon == null) {
      return;
    }
    setPageContextEntity({ key, name, icon });
    return () =>
      setPageContextEntity((current) =>
        current?.key === key ? null : current,
      );
  }, [key, name, icon, setPageContextEntity]);
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
  const [pageContextEntity, setPageContextEntity] =
    useState<MetabotPageContextEntity | null>(null);

  const getChatContext = useCallback(async () => {
    const state = store.getState();
    const providerFns = [...providerFnsRef.current];

    const hasDataAccess = canUserCreateQueries(state);
    const hasNativeWrite = canUserCreateNativeQueries(state);

    let ctx: MetabotChatContext = {
      user_is_viewing: [],
      current_time_with_timezone: dayjs.tz(dayjs()).format(),
      // Unjustified type cast. FIXME
      capabilities: _.compact([
        hasDataAccess && "permission:save_questions",
        hasNativeWrite && "permission:write_sql_queries",
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
        pageContextEntity,
        setPageContextEntity,
      }}
    >
      {children}
    </MetabotContext.Provider>
  );
};
