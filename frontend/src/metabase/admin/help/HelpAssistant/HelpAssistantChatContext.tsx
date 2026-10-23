import { type ReactNode, createContext, useContext } from "react";

import { useDiagnosticInfo } from "../use-diagnostic-info";

import {
  type HelpAssistantChat,
  useHelpAssistantChat,
} from "./use-help-assistant-chat";

const HelpAssistantChatContext = createContext<HelpAssistantChat | null>(null);

/**
 * Holds the conversation above the help routes, so it is still there when
 * someone opens "Diagnostic info" from the chat and comes back.
 */
export function HelpAssistantChatProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { diagnosticInfo } = useDiagnosticInfo();
  const chat = useHelpAssistantChat(diagnosticInfo);

  return (
    <HelpAssistantChatContext.Provider value={chat}>
      {children}
    </HelpAssistantChatContext.Provider>
  );
}

export function useHelpAssistantChatContext() {
  const chat = useContext(HelpAssistantChatContext);
  if (chat == null) {
    throw new Error(
      "useHelpAssistantChatContext must be used inside HelpAssistantChatProvider",
    );
  }
  return chat;
}
