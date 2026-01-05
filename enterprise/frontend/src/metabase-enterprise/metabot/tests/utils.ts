import userEvent from "@testing-library/user-event";

import { act, fireEvent, screen, waitFor } from "__support__/ui";
import {
  type MockStreamedEndpointParams,
  mockStreamedEndpoint,
} from "metabase-enterprise/api/ai-streaming/test-utils";

import { type MetabotAgentId, setVisible } from "../state";

export const mockAgentEndpoint = (params: MockStreamedEndpointParams) =>
  mockStreamedEndpoint("/api/ee/metabot-v3/agent-streaming", params);

export const chat = () => screen.findByTestId("metabot-chat");
export const chatMessages = () =>
  screen.findAllByTestId("metabot-chat-message");
export const lastChatMessage = async () => (await chatMessages()).at(-1);
export const input = async () => {
  const chatInput = await screen.findByTestId("metabot-chat-input");
  return chatInput.querySelector('[contenteditable="true"]')!;
};
export const enterChatMessage = async (message: string, send = true) => {
  // using userEvent.type works locally but in CI characters are sometimes dropped
  // so "Who is your favorite?" becomes something like "Woi or fvrite?"
  const editor = await input();
  editor.textContent = message;
  fireEvent.input(editor, {
    target: { textContent: message },
  });
  if (send) {
    await userEvent.type(await input(), "{Enter}");
  }
};
export const sendMessageButton = () =>
  screen.findByTestId("metabot-send-message");
export const stopResponseButton = () =>
  screen.findByTestId("metabot-stop-response");
export const closeChatButton = () => screen.findByTestId("metabot-close-chat");
export const responseLoader = () =>
  screen.findByTestId("metabot-response-loader");
export const resetChatButton = () => screen.findByTestId("metabot-reset-chat");

export const assertVisible = async () =>
  expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();
export const assertNotVisible = async () =>
  await waitFor(() => {
    expect(screen.queryByTestId("metabot-chat")).not.toBeInTheDocument();
  });

// NOTE: for some reason the keyboard shortcuts won't work with tinykeys while testing, using redux for now...
export const hideMetabot = (
  dispatch: any,
  agentId: MetabotAgentId = "omnibot",
) => act(() => dispatch(setVisible({ agentId, visible: false })));
export const showMetabot = (
  dispatch: any,
  agentId: MetabotAgentId = "omnibot",
) => act(() => dispatch(setVisible({ agentId, visible: true })));

export const assertConversation = async (
  expectedMessages: ["user" | "agent", string][],
) => {
  if (!expectedMessages.length) {
    await waitFor(() => {
      expect(
        screen.queryByTestId("metabot-chat-message"),
      ).not.toBeInTheDocument();
    });
  } else {
    const realMessages = await chatMessages();
    expect(realMessages.length).toBe(expectedMessages.length);
    expectedMessages.forEach(([expectedRole, expectedMessage], index) => {
      const realMessage = realMessages[index];
      expect(realMessage).toHaveAttribute("data-message-role", expectedRole);
      expect(realMessage).toHaveTextContent(expectedMessage);
    });
  }
};

export const lastReqBody = async (
  agentSpy: ReturnType<typeof mockAgentEndpoint>,
) => {
  await waitFor(() => expect(agentSpy).toHaveBeenCalled());
  return JSON.parse(agentSpy.mock.lastCall?.[1]?.body as string);
};
