import { useEffect, useMemo, useRef, useState } from "react";
import { usePrevious } from "react-use";

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

export function useMetabot({
  latestMBQL,
}: {
  latestMBQL?: string;
} = {}): UseMetabotHookResult {
  const metabot = useMetabotAgent();
  const [messages, setMessages] = useState<MetabotMessage[]>([]);
  const [latestQuestionPath, setLatestQuestionPath] = useState<string | null>(
    null,
  );

  // const previousMBQL = usePrevious(latestMBQL);

  const status = useMemo(() => {
    if (metabot.isDoingScience) {
      return "thinking";
    }

    return "ready";
  }, [metabot]);

  function sendMessage(content: string) {
    let modifiedContent = content;

    const lastQuestionPath = messages
      .filter(message => message.sender === "bot" && message.questionPath)
      .slice(-1)?.[0]?.questionPath;

    let lastQuestionMBQL = "";

    try {
      lastQuestionMBQL = atob(
        lastQuestionPath?.replace("/question#", "") ?? "",
      );
    } catch (error) {}

    const hasMBQLChanged = lastQuestionMBQL !== latestMBQL;

    console.log("lastQuestionMBQL", {
      lastQuestionMBQL,
      latestMBQL,
      hasMBQLChanged,
    });

    if (latestMBQL) {
      modifiedContent = `${content}\n\n<instruction>You must build a query based on this MBQL: ${latestMBQL}. Make sure to prioritize breakouts and aggregation from this MBQL query, plus the user's natural language query above.</instruction>`;
    }

    // Add user message to history
    const userMessage: MetabotMessage = {
      id: `user-${Date.now()}`,
      content: modifiedContent,
      sender: "user",
      timestamp: Date.now(),
    };

    setMessages(prevMessages => [...prevMessages, userMessage]);

    metabot
      .submitInput(modifiedContent, { skipHistory: false })
      .then(result => {
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
