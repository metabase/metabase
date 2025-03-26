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
  messages: MetabotMessage[];
  latestQuestionPath: string | null;

  sendMessage(message: string): void;
  summarizeChartFromElement(element: HTMLElement): void;
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

  async function summarizeChartFromElement(element: HTMLElement) {
    const blob = await captureImageFromElementAsBlob(element);

    if (!blob) {
      return;
    }

    const model = "openai/gpt-4o-2024-11-20";
    const body = new FormData();
    body.append("image", blob, "chart.png");

    // TODO: proxy via the backend instead of calling ai-service directly
    const response = await fetch(
      `http://localhost:8000/experimental/summarize-chart?model=${model}`,
      {
        body,
        method: "POST",
        headers: {
          // !!!!!!!!!!!!!!!!!! do not commit the token - this is for demo only
          "x-metabase-instance-token": "<YOUR_MB_INSTANCE_TOKEN_UNSAFE>",
        },
      },
    );

    const output = await response.json();

    setMessages(prevMessages => [
      ...prevMessages,
      {
        id: `bot-${Date.now()}`,
        content: output?.summary,
        sender: "bot",
        timestamp: Date.now(),
      },
    ]);

    return output?.summary;
  }

  return {
    status,
    messages,
    latestQuestionPath,

    sendMessage,
    summarizeChartFromElement,
  };
}

export async function captureImageFromElementAsBlob(
  element: HTMLElement,
): Promise<Blob | null> {
  const { default: html2canvas } = await import("html2canvas-pro");

  return new Promise(resolve => {
    if (!element || !(element instanceof HTMLElement)) {
      return resolve(null);
    }

    html2canvas(element, {
      scale: 2,
      useCORS: true,
      onclone: (doc: Document, node: HTMLElement) => {
        node.style.borderRadius = "0px";
        node.style.border = "none";
      },
    }).then(canvas => canvas.toBlob(blob => resolve(blob)));
  });
}
