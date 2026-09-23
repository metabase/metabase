import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { act, fireEvent, screen, waitFor } from "__support__/ui";
import { metabotActions } from "metabase/metabot/state";

import {
  enterChatMessage,
  hideMetabot,
  input,
  lastReqBody,
  mockAgentEndpoint,
  setup,
  showMetabot,
  whoIsYourFavoriteResponse,
} from "./utils";

const prompts = [
  "Show the trend",
  "Break it down by region",
  "Compare with last year",
];
const completedResponse = [
  ...whoIsYourFavoriteResponse,
  { type: "finish", finishReason: "stop" } as const,
];

describe("Metabot follow-up prompts", () => {
  it("shows multiple prompts after a response and hides them while typing", async () => {
    setup({ followUpPrompts: prompts });
    mockAgentEndpoint({ events: completedResponse });
    await enterChatMessage("Show sales");
    expect(
      await screen.findByRole("button", { name: prompts[0] }),
    ).toBeVisible();
    expect(await input()).toHaveTextContent(/^$/);
    expect(
      fetchMock.callHistory.calls("metabot-follow-up-prompts"),
    ).toHaveLength(1);

    await act(async () => enterChatMessage("My own question", false));
    expect(
      screen.queryByTestId("metabot-prompt-suggestions"),
    ).not.toBeInTheDocument();
    await userEvent.clear(await input());
    expect(screen.getByRole("button", { name: prompts[0] })).toBeVisible();
    expect(
      fetchMock.callHistory.calls("metabot-follow-up-prompts"),
    ).toHaveLength(1);
  });

  it("shows a single prompt as a placeholder and sends it with Tab", async () => {
    setup({ followUpPrompts: [prompts[0]] });
    const agent = mockAgentEndpoint({ events: completedResponse });
    await enterChatMessage("Show sales");
    await waitFor(() =>
      expect(
        screen.getByText("", { selector: "[data-placeholder]" }),
      ).toHaveAttribute("data-placeholder", `${prompts[0]} (Tab to send)`),
    );
    expect(
      screen.queryByTestId("metabot-prompt-suggestions"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Tab to send")).not.toBeInTheDocument();
    fireEvent.keyDown(await input(), { key: "Tab" });
    await waitFor(async () =>
      expect((await lastReqBody(agent)).message).toBe(prompts[0]),
    );
  });

  it("cycles through suggestions and the input, and submits with Enter", async () => {
    setup({ followUpPrompts: prompts });
    const agent = mockAgentEndpoint({ events: completedResponse });
    await enterChatMessage("Show sales");
    const first = await screen.findByRole("button", { name: prompts[0] });
    const last = screen.getByRole("button", { name: prompts[2] });
    const editor = await input();
    fireEvent.keyDown(editor, { key: "ArrowUp" });
    expect(last).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(editor).toHaveFocus());
    fireEvent.keyDown(editor, { key: "ArrowDown" });
    expect(first).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    await waitFor(() => expect(editor).toHaveFocus());
    fireEvent.keyDown(editor, { key: "ArrowDown" });
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await waitFor(async () =>
      expect((await lastReqBody(agent)).message).toBe(prompts[1]),
    );
  });

  it("does not generate suggestions when reopening a completed conversation", async () => {
    const { store } = setup({ followUpPrompts: prompts });
    mockAgentEndpoint({ events: completedResponse });
    await enterChatMessage("Show sales");
    await screen.findByRole("button", { name: prompts[0] });
    hideMetabot(store.dispatch);
    showMetabot(store.dispatch);
    await input();
    expect(
      fetchMock.callHistory.calls("metabot-follow-up-prompts"),
    ).toHaveLength(1);
    expect(
      screen.queryByTestId("metabot-prompt-suggestions"),
    ).not.toBeInTheDocument();
  });

  it("ignores a late result after the conversation is reset", async () => {
    const { store } = setup();
    let resolve: (response: { prompts: string[] }) => void = () => {};
    const response = new Promise<{ prompts: string[] }>((done) => {
      resolve = done;
    });
    fetchMock.removeRoute("metabot-follow-up-prompts");
    fetchMock.post(
      "express:/api/metabot/conversations/:id/follow-up-prompts",
      () => response,
      { name: "metabot-follow-up-prompts" },
    );
    mockAgentEndpoint({ events: completedResponse });
    await enterChatMessage("Show sales");
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("metabot-follow-up-prompts"),
      ).toHaveLength(1),
    );
    act(() =>
      store.dispatch(
        metabotActions.startNewConversation({ agentId: "omnibot" }),
      ),
    );
    await act(async () => resolve({ prompts }));
    expect(
      screen.queryByRole("button", { name: prompts[0] }),
    ).not.toBeInTheDocument();
  });

  it.each([200, 500])(
    "leaves the composer usable when suggestions are empty or fail (%s)",
    async (status) => {
      setup();
      fetchMock.modifyRoute("metabot-follow-up-prompts", {
        response: { status, body: { prompts: [] } },
      });
      mockAgentEndpoint({ events: completedResponse });
      await enterChatMessage("Show sales");
      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls("metabot-follow-up-prompts"),
        ).toHaveLength(1),
      );
      await act(async () => fetchMock.callHistory.flush(true));
      expect(
        screen.queryByTestId("metabot-prompt-suggestions"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Tab to send")).not.toBeInTheDocument();
      await act(async () => enterChatMessage("My next question", false));
      expect(await input()).toHaveTextContent("My next question");
    },
  );

  it.each(["error", "length"] as const)(
    "does not generate after a %s finish",
    async (finishReason) => {
      setup();
      mockAgentEndpoint({
        events: [
          ...whoIsYourFavoriteResponse,
          { type: "finish", finishReason },
        ],
      });
      await enterChatMessage("Show sales");
      await screen.findByText("You, but don't tell anyone.");
      expect(
        fetchMock.callHistory.calls("metabot-follow-up-prompts"),
      ).toHaveLength(0);
    },
  );
});
