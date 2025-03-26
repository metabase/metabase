import { useMemo, useState } from "react";

import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

export type MetabotStatus = "ready" | "thinking" | "failed";

export interface MetabotMessage {
  id: string;
  content: string;
  sender: "user" | "bot";
  timestamp: number;
  questionPath?: string | null;
}

export interface UseMetabotHookResult {
  status: MetabotStatus;
  sendMessage(message: string): void;
  messages: MetabotMessage[];
  latestQuestionPath: string | null;
}

export function useMetabot(): UseMetabotHookResult {
  const metabot = useMetabotAgent();
  const [messages, setMessages] = useState<MetabotMessage[]>([]);
  const [latestQuestionPath, setLatestQuestionPath] = useState<string | null>(
    null,
  );

  const status = useMemo(() => {
    if (metabot.isDoingScience) {
      return "thinking";
    }

    return "ready";
  }, [metabot]);

  function sendMessage(content: string) {
    // Add user message to history
    const userMessage: MetabotMessage = {
      id: `user-${Date.now()}`,
      content,
      sender: "user",
      timestamp: Date.now(),
    };

    setMessages(prevMessages => [...prevMessages, userMessage]);

    metabot.submitInput(content).then(result => {
      // Extract question path from result
      const questionPath = (
        result?.payload as any
      )?.payload?.data?.reactions?.find(
        (reaction: { type: string; url: string }) =>
          reaction.type === "metabot.reaction/redirect",
      )?.url;

      // Add bot response to history
      const botMessage: MetabotMessage = {
        id: `bot-${Date.now()}`,
        content: metabot.userMessages[metabot.userMessages.length - 1] || "",
        sender: "bot",
        timestamp: Date.now(),
        questionPath,
      };

      setMessages(prevMessages => [...prevMessages, botMessage]);
      setLatestQuestionPath(questionPath);
    });
  }

  return {
    status,
    sendMessage,
    messages,
    latestQuestionPath,
  };
}
