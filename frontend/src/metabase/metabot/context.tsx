import type React from "react";
import {
  type RefObject,
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
import type { MetabotChatContext } from "metabase-types/api";

import {
  type AttachmentDraft,
  EMPTY_ATTACHMENT_DRAFT,
} from "./attachment-state";

export type ChatContextProviderFn = (
  state: State,
) => Promise<Partial<MetabotChatContext> | void>;

export type DeregisterChatContextProviderFn = () => void;

// internal type so we can support tiptap editor and textarea as inputs
export type MetabotPromptInputRef = {
  focus: () => void;
  clear?: () => void;
  getValue?: () => string;
  captureDictationSelection?: () => {
    insert: (text: string) => string | null;
    restore: () => void;
  };
  scrollHeight: number;
  scrollTop: number;
};

export type MetabotCtx = {
  attachmentDrafts: Record<string, AttachmentDraft>;
  getAttachmentDraft: (conversationId: string) => AttachmentDraft;
  setAttachmentDraft: (conversationId: string, draft: AttachmentDraft) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  promptInputRef: RefObject<MetabotPromptInputRef> | undefined;

  getChatContext: () => Promise<MetabotChatContext>;
  registerChatContextProvider: (
    fn: ChatContextProviderFn,
  ) => DeregisterChatContextProviderFn;
};

export const defaultContext: MetabotCtx = {
  attachmentDrafts: {},
  getAttachmentDraft: () => EMPTY_ATTACHMENT_DRAFT,
  setAttachmentDraft: () => {},
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
  const [attachmentDrafts, setAttachmentDrafts] = useState<
    Record<string, AttachmentDraft>
  >({});
  const attachmentDraftsRef = useRef(attachmentDrafts);
  const getAttachmentDraft = useCallback(
    (id: string) => attachmentDraftsRef.current[id] ?? EMPTY_ATTACHMENT_DRAFT,
    [],
  );
  const setAttachmentDraft = useCallback(
    (id: string, draft: AttachmentDraft) => {
      const drafts = { ...attachmentDraftsRef.current };
      if (draft.files.length === 0 && draft.status === "idle" && !draft.error) {
        delete drafts[id];
      } else {
        drafts[id] = draft;
      }
      attachmentDraftsRef.current = drafts;
      setAttachmentDrafts(drafts);
    },
    [],
  );

  /* Metabot input */
  const [prompt, setPrompt] = useState("");
  const promptInputRef = useRef<MetabotPromptInputRef>(null);

  /* Metabot context */
  const providerFnsRef = useRef<Set<ChatContextProviderFn>>(new Set());
  const store = useStore();

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
        attachmentDrafts,
        getAttachmentDraft,
        setAttachmentDraft,
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
