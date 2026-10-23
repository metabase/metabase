import { useCallback, useMemo, useRef, useState } from "react";

import { isAbortError } from "metabase/api/client";
import { uuid } from "metabase/utils/uuid";
import type {
  HelpAssistantChatEntry,
  HelpAssistantConversationId,
  HelpAssistantFeedback,
} from "metabase-types/api";

import {
  useDeleteHelpAssistantConversationMutation,
  useListHelpAssistantConversationsQuery,
  useSaveHelpAssistantConversationMutation,
  useSendHelpAssistantFeedbackMutation,
  useSendHelpAssistantMessageMutation,
} from "./api";
import {
  getConversationTitle,
  getRecentConversations,
  getUnansweredQuestion,
  withoutUnansweredQuestion,
} from "./utils";

export const MAX_SAVED_CONVERSATIONS = 10;

type ChatRequest = ReturnType<
  ReturnType<typeof useSendHelpAssistantMessageMutation>[0]
>;

export type HelpAssistantChat = ReturnType<typeof useHelpAssistantChat>;

export function useHelpAssistantChat(diagnosticInfo: string) {
  const [conversationId, setConversationId] =
    useState<HelpAssistantConversationId | null>(null);
  const [entries, setEntries] = useState<HelpAssistantChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [includeDiagnosticInfo, setIncludeDiagnosticInfo] = useState(true);
  const pendingRequestRef = useRef<ChatRequest | null>(null);

  const [sendMessage, { isLoading, error, reset }] =
    useSendHelpAssistantMessageMutation();
  const [sendFeedback] = useSendHelpAssistantFeedbackMutation();
  const [saveConversation] = useSaveHelpAssistantConversationMutation();
  const [deleteConversation] = useDeleteHelpAssistantConversationMutation();
  const { data: savedConversations } = useListHelpAssistantConversationsQuery();

  const conversations = useMemo(
    () => getRecentConversations(savedConversations ?? {}),
    [savedConversations],
  );
  const isConversationSaved = conversations.some(
    ({ id }) => id === conversationId,
  );

  const save = useCallback(
    (
      id: HelpAssistantConversationId,
      messages: HelpAssistantChatEntry[],
      updatedAt = new Date().toISOString(),
    ) => {
      const isNew = savedConversations?.[id] == null;
      saveConversation({
        id,
        conversation: {
          title: getConversationTitle(messages),
          updated_at: updatedAt,
          messages,
        },
      });
      if (isNew) {
        conversations
          .slice(MAX_SAVED_CONVERSATIONS - 1)
          .forEach((conversation) => deleteConversation(conversation.id));
      }
    },
    [conversations, deleteConversation, saveConversation, savedConversations],
  );

  const abortPendingRequest = useCallback(() => {
    const request = pendingRequestRef.current;
    pendingRequestRef.current = null;
    request?.abort();
  }, []);

  const request = useCallback(
    async (
      id: HelpAssistantConversationId,
      nextEntries: HelpAssistantChatEntry[],
    ) => {
      reset();
      const pendingRequest = sendMessage({
        messages: nextEntries.map(({ role, content }) => ({ role, content })),
        diagnostic_info: includeDiagnosticInfo ? diagnosticInfo : undefined,
      });
      pendingRequestRef.current = pendingRequest;

      const result = await pendingRequest;
      if (pendingRequestRef.current !== pendingRequest) {
        // Stopped, or another conversation was opened while waiting. Clear the
        // abort error unless a newer request is already running.
        if (pendingRequestRef.current == null) {
          reset();
        }
        return;
      }
      pendingRequestRef.current = null;

      if (result.data) {
        const { reply, sources } = result.data;
        const answeredEntries: HelpAssistantChatEntry[] = [
          ...nextEntries,
          { role: "assistant", content: reply, sources },
        ];
        setEntries(answeredEntries);
        save(id, answeredEntries);
      }
    },
    [diagnosticInfo, includeDiagnosticInfo, reset, save, sendMessage],
  );

  const send = useCallback(
    (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (!question || isLoading) {
        return;
      }
      const id = conversationId ?? uuid();
      // After an error, a new question replaces the one that got no answer.
      const nextEntries: HelpAssistantChatEntry[] = [
        ...withoutUnansweredQuestion(entries),
        { role: "user", content: question },
      ];
      setConversationId(id);
      setEntries(nextEntries);
      setDraft("");
      request(id, nextEntries);
    },
    [conversationId, entries, isLoading, request],
  );

  const retry = useCallback(() => {
    if (conversationId && getUnansweredQuestion(entries) && !isLoading) {
      request(conversationId, entries);
    }
  }, [conversationId, entries, isLoading, request]);

  const stop = useCallback(() => {
    const question = getUnansweredQuestion(entries);
    abortPendingRequest();
    setEntries(withoutUnansweredQuestion(entries));
    if (question) {
      setDraft(question.content);
    }
  }, [abortPendingRequest, entries]);

  const startNewChat = useCallback(() => {
    abortPendingRequest();
    setConversationId(null);
    setEntries([]);
    setDraft("");
    reset();
  }, [abortPendingRequest, reset]);

  const openConversation = useCallback(
    (id: HelpAssistantConversationId) => {
      const conversation = savedConversations?.[id];
      if (!conversation) {
        return;
      }
      abortPendingRequest();
      setConversationId(id);
      setEntries(conversation.messages);
      setDraft("");
      reset();
    },
    [abortPendingRequest, reset, savedConversations],
  );

  const removeConversation = useCallback(
    (id: HelpAssistantConversationId) => {
      deleteConversation(id);
      if (id === conversationId) {
        startNewChat();
      }
    },
    [conversationId, deleteConversation, startNewChat],
  );

  const rateAnswer = useCallback(
    (answerIndex: number, feedback: HelpAssistantFeedback) => {
      const answer = entries[answerIndex];
      if (answer?.role !== "assistant" || conversationId == null) {
        return;
      }
      const question = entries
        .slice(0, answerIndex)
        .findLast((entry) => entry.role === "user");
      const nextEntries = entries.map((entry, index) =>
        index === answerIndex ? { ...entry, feedback } : entry,
      );
      setEntries(nextEntries);
      // Keep the conversation's place in the history: a rating isn't new activity.
      save(
        conversationId,
        withoutUnansweredQuestion(nextEntries),
        savedConversations?.[conversationId]?.updated_at,
      );
      sendFeedback({
        ...feedback,
        question: question?.content ?? "",
        answer: answer.content,
        sources: answer.sources,
      });
    },
    [conversationId, entries, save, savedConversations, sendFeedback],
  );

  return useMemo(
    () => ({
      conversationId,
      conversations,
      isConversationSaved,
      entries,
      draft,
      setDraft,
      includeDiagnosticInfo,
      setIncludeDiagnosticInfo,
      isLoading,
      error: isAbortError(error) ? undefined : error,
      send,
      retry,
      stop,
      startNewChat,
      openConversation,
      deleteConversation: removeConversation,
      rateAnswer,
    }),
    [
      conversationId,
      conversations,
      isConversationSaved,
      entries,
      draft,
      includeDiagnosticInfo,
      isLoading,
      error,
      send,
      retry,
      stop,
      startNewChat,
      openConversation,
      removeConversation,
      rateAnswer,
    ],
  );
}
