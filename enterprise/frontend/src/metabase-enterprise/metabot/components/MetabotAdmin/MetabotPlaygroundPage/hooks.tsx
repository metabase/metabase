import { useRef, useState } from "react";

import { useSetting } from "metabase/common/hooks";

import type { BotConfig, Playground } from "./types";
import { getIframeDimensions } from "./utils";

const defaultBotState = [
  { profile: "" /* default profile */, debug: true },
  { profile: "metabot_next", debug: true },
];

export const useBots = () => {
  const [bots, setBots] = useState<BotConfig[]>(defaultBotState);
  return {
    bots,
    resetBots: () => setBots(defaultBotState),
    addBot: (bot: BotConfig) => setBots((bots) => bots.concat(bot)),
    updateBot: (index: number, bot: BotConfig) =>
      setBots((bots) => bots.map((b, i) => (i === index ? bot : b))),
    removeBot: (index: number) =>
      setBots((bots) => bots.filter((_, i) => i !== index)),
  };
};

export const usePlaygroundSupport = () => {
  const isEmbeddingEnabled = useSetting("enable-embedding-interactive");

  // NOTE: probably not a perfectly correct calculation
  const embeddingOrigin = useSetting("embedding-app-origins-interactive") ?? "";
  const isValidEmbeddingOrigin = embeddingOrigin.split(" ").some((url) => {
    const sameHost = url.split("/").pop() === window.location.host;
    const validSubdomain =
      url.startsWith("*.") &&
      url.includes(window.location.host.split(".").slice(-2).join("."));
    return sameHost || validSubdomain;
  });

  return {
    isSupported: isEmbeddingEnabled && isValidEmbeddingOrigin,
    isEmbeddingEnabled,
  };
};

export const usePlaygrounds = (bots: BotConfig[]) => {
  const [firstSubmittedInput, setFirstSubmittedInput] = useState<string>("");

  const iframesContainerRef = useRef<HTMLDivElement | null>(null);

  const submitInputToIframes = (input: string) => {
    if (iframesContainerRef.current) {
      [...iframesContainerRef.current.querySelectorAll("iframe")].forEach(
        (iframe) => {
          const dom = iframe.contentDocument || iframe.contentWindow?.document;
          if (dom) {
            const inputEl = dom.querySelector(
              '[data-testid="metabot-chat-input"] [contenteditable]',
            );
            if (inputEl) {
              inputEl.textContent = input;
              inputEl.dispatchEvent(
                new InputEvent("input", {
                  bubbles: true,
                  cancelable: true,
                  data: input,
                }),
              );
              setTimeout(() => {
                const enter = {
                  key: "Enter",
                  code: "Enter",
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                };
                inputEl.dispatchEvent(new KeyboardEvent("keydown", enter));
                inputEl.dispatchEvent(new KeyboardEvent("keyup", enter));
              }, 100);
            }
          }
        },
      );
    }
  };

  const submitPrompt = (input: string) => {
    firstSubmittedInput
      ? submitInputToIframes(input)
      : setFirstSubmittedInput(input);
  };

  const iframeDimensions = getIframeDimensions(iframesContainerRef.current);

  const playgrounds: Playground[] = firstSubmittedInput
    ? bots.map((bot) => {
        let src = `/metabot/new?q=${firstSubmittedInput}`;
        if (bot.profile) {
          src += `&p=${bot.profile}`;
        }
        if (bot.debug) {
          src += `&d=true`;
        }
        return {
          iframe: {
            src,
            width: `${iframeDimensions.width}px`,
            height: `${iframeDimensions.height}px`,
          },
          bot,
        };
      })
    : [];

  return {
    playgrounds,
    submitPrompt,
    resetPlaygrounds: () => setFirstSubmittedInput(""),
    iframesContainerRef,
  };
};
