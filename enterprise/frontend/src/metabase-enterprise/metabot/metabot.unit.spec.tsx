import { combineReducers } from "@reduxjs/toolkit";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { P, isMatching } from "ts-pattern";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { isUuid, uuid } from "metabase/lib/uuid";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { Metabot } from "./components/Metabot";
import { METABOT_AUTO_CLOSE_DURATION_MS } from "./components/MetabotChat";
import { MetabotProvider } from "./context";
import {
  type MetabotState,
  metabotInitialState,
  metabotReducer,
  setIsProcessing,
  setVisible,
} from "./state";

function setup(
  options: {
    ui?: React.ReactElement;
    metabotPluginInitialState?: MetabotState;
  } | void,
) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      metabot_v3: true,
    }),
  });

  setupEnterprisePlugins();

  const {
    ui = <Metabot />,
    metabotPluginInitialState = {
      ...metabotInitialState,
      sessionId: uuid(),
      visible: true,
    },
  } = options || {};

  return renderWithProviders(<MetabotProvider>{ui}</MetabotProvider>, {
    storeInitialState: createMockState({
      settings,
      plugins: {
        metabotPlugin: metabotPluginInitialState,
      },
    } as any),
    customReducers: {
      plugins: combineReducers({
        metabotPlugin: metabotReducer,
      }),
    },
  });
}

const chat = () => screen.findByTestId("metabot-chat");
const input = () => screen.findByTestId("metabot-chat-input");
const enterChatMessage = async (message: string, send = true) =>
  userEvent.type(await input(), `${message}${send ? "{Enter}" : ""}`);
const closeChatButton = () => screen.findByTestId("metabot-close-chat");

const assertVisible = async () =>
  expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();
const assertNotVisible = async () =>
  await waitFor(() => {
    expect(screen.queryByTestId("metabot-chat")).not.toBeInTheDocument();
  });

// NOTE: for some reason the keyboard shortcuts won't work with tinykeys while testing, using redux for now...
const hideMetabot = (dispatch: any) => act(() => dispatch(setVisible(false)));
const showMetabot = (dispatch: any) => act(() => dispatch(setVisible(true)));

const lastReqBody = async () => {
  const lastCall = fetchMock.lastCall();
  const bodyStr = String(await lastCall?.[1]?.body) || "";
  return JSON.parse(bodyStr);
};

describe("metabot", () => {
  describe("ui", () => {
    // eslint-disable-next-line jest/expect-expect
    it("should be able to render metabot", async () => {
      setup();
      await assertVisible();
    });

    it("should be able to toggle visibility", async () => {
      const { store } = setup();
      expect(await chat()).toBeInTheDocument();
      await assertVisible();

      hideMetabot(store.dispatch);
      await assertNotVisible();

      showMetabot(store.dispatch);
      expect(await chat()).toBeInTheDocument();

      await userEvent.click(await closeChatButton());
      await assertNotVisible();
    });

    it("should start a new session each time metabot is opened", async () => {
      const { store } = setup({
        metabotPluginInitialState: metabotInitialState,
      });
      fetchMock.post(
        `path:/api/ee/metabot-v3/agent`,
        whoIsYourFavoriteResponse,
      );

      showMetabot(store.dispatch);
      await enterChatMessage("Who is your favorite?");
      const firstSessionId = (await lastReqBody())?.session_id;
      expect(isUuid(firstSessionId)).toBeTruthy();
      hideMetabot(store.dispatch);

      showMetabot(store.dispatch);
      await enterChatMessage("Who is your favorite?");
      const secondSessionId = (await lastReqBody())?.session_id;
      expect(isUuid(secondSessionId)).toBeTruthy();

      expect(secondSessionId).not.toBe(firstSessionId);
    });

    // eslint-disable-next-line jest/expect-expect
    it("should auto-close metabot if inactive with no user input", async () => {
      jest.useFakeTimers({ advanceTimers: true });

      const { store } = setup();

      // auto-hides
      await assertVisible();
      act(() => jest.advanceTimersByTime(METABOT_AUTO_CLOSE_DURATION_MS));
      await assertNotVisible();

      // does not auto-hide if there's user input
      showMetabot(store.dispatch);
      await userEvent.type(await input(), "Testing");
      act(() => jest.advanceTimersByTime(METABOT_AUTO_CLOSE_DURATION_MS));
      await assertVisible();
      hideMetabot(store.dispatch);

      // does not auto-close if metabot is processing a response
      showMetabot(store.dispatch);
      act(() => store.dispatch(setIsProcessing(true)));
      act(() => jest.advanceTimersByTime(METABOT_AUTO_CLOSE_DURATION_MS));
      await assertVisible();
      act(() => store.dispatch(setIsProcessing(false)));
      act(() => jest.advanceTimersByTime(METABOT_AUTO_CLOSE_DURATION_MS));
      await assertNotVisible();

      // does not auto-close if metabot is loading
      showMetabot(store.dispatch);
      fetchMock.post(
        `path:/api/ee/metabot-v3/agent`,
        whoIsYourFavoriteResponse,
        { delay: METABOT_AUTO_CLOSE_DURATION_MS + 1000 }, // load longer than delay
      );
      await enterChatMessage("Who is your favorite?");
      act(() => jest.advanceTimersByTime(METABOT_AUTO_CLOSE_DURATION_MS));
      await assertVisible();
      hideMetabot(store.dispatch);

      jest.useRealTimers();
    });

    // eslint-disable-next-line jest/expect-expect
    it("should properly auto-close metabot if route changes", async () => {
      const { store } = setup();

      // should close on normal route change
      await assertVisible();
      act(() => window.history?.pushState(null, "", "/1"));
      await assertNotVisible();

      // should not close on route change if metabot is processing
      showMetabot(store.dispatch);
      act(() => store.dispatch(setIsProcessing(true)));
      act(() => window.history?.pushState(null, "", "/2"));
      await assertVisible();
      act(() => store.dispatch(setIsProcessing(false)));
      hideMetabot(store.dispatch);
      await assertNotVisible();

      // should not close if user has value in the input
      showMetabot(store.dispatch);
      await userEvent.type(await input(), "Some incomplete user prompt");
      act(() => window.history?.pushState(null, "", "/3"));
      await assertVisible();
    });
  });

  describe("message", () => {
    it("should properly send chat messages", async () => {
      setup();
      fetchMock.post(
        `path:/api/ee/metabot-v3/agent`,
        whoIsYourFavoriteResponse,
        { delay: 50 }, // small delay to cause loading state
      );

      await enterChatMessage("Who is your favorite?", false);
      expect(await input()).toHaveValue("Who is your favorite?");

      await enterChatMessage("Who is your favorite?");
      expect(
        await screen.findByPlaceholderText("Doing science..."),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("You are... but don't tell anyone!"),
      ).toBeInTheDocument();

      // should auto-clear input + refocus
      expect(await input()).toHaveValue("");
      expect(await input()).toHaveFocus();
    });
  });

  describe("context", () => {
    it("should send along default context", async () => {
      setup();
      fetchMock.post(
        `path:/api/ee/metabot-v3/agent`,
        whoIsYourFavoriteResponse,
      );

      await enterChatMessage("Who is your favorite?");

      expect(
        isMatching(
          { current_time_with_timezone: P.string },
          (await lastReqBody())?.context,
        ),
      ).toEqual(true);
    });

    it("should allow components to register additional context", async () => {
      fetchMock.post(
        `path:/api/ee/metabot-v3/agent`,
        whoIsYourFavoriteResponse,
      );

      const TestComponentOne = () => {
        useRegisterMetabotContextProvider(() => ({ a: 1 }), []);
        return null;
      };

      const TestComponentTwo = () => {
        useRegisterMetabotContextProvider(() => ({ b: 2 }), []);
        return null;
      };

      setup({
        ui: (
          <>
            <Metabot />
            <TestComponentOne />
            <TestComponentTwo />
          </>
        ),
      });

      await enterChatMessage("Who is your favorite?");

      expect(
        isMatching(
          { current_time_with_timezone: P.string, a: 1, b: 2 },
          (await lastReqBody())?.context,
        ),
      ).toBe(true);
    });
  });

  describe("history", () => {
    it("should send history from last response along with next message", async () => {
      setup();
      fetchMock.post(
        `path:/api/ee/metabot-v3/agent`,
        whoIsYourFavoriteResponse,
      );

      // send a message to get some history back
      await enterChatMessage("Who is your favorite?");
      await waitFor(() => expect(fetchMock.calls()).toHaveLength(1));

      // send another message and check that there is proper history
      await enterChatMessage("Hi!");
      const lastCall = fetchMock.lastCall();
      const bodyStr = String(await lastCall?.[1]?.body) || "";
      const sentHistory = JSON.parse(bodyStr)?.history;
      expect(sentHistory).toEqual(whoIsYourFavoriteResponse.history);
    });

    it("should clear history if metabot is closed", async () => {
      const { store } = setup();
      fetchMock.post(
        `path:/api/ee/metabot-v3/agent`,
        whoIsYourFavoriteResponse,
      );

      // send a message to get some history back
      await enterChatMessage("Who is your favorite?");
      await waitFor(() => expect(fetchMock.calls()).toHaveLength(1));

      // close, open, and then send another message and check that there is no history
      hideMetabot(store.dispatch);
      showMetabot(store.dispatch);
      await enterChatMessage("Hi!");
      const lastCall = fetchMock.lastCall();
      const bodyStr = String(await lastCall?.[1]?.body) || "";
      const sentHistory = JSON.parse(bodyStr)?.history;
      expect(sentHistory).toEqual([]);
    });
  });
});

const whoIsYourFavoriteResponse = {
  reactions: [
    {
      type: "metabot.reaction/message",
      message: "You are... but don't tell anyone!",
    },
  ],
  history: [
    {
      role: "user",
      content: "Who is your favorite?",
    },
    {
      content: "",
      role: "assistant",
      "tool-calls": [
        {
          id: "call_PVmnR8mcnYFF2AmqupSKzJDh",
          name: "metabot.tool/who-is-your-favorite",
          arguments: {},
        },
      ],
    },
    {
      role: "tool",
      "tool-call-id": "call_PVmnR8mcnYFF2AmqupSKzJDh",
      content: "You are... but don't tell anyone!",
    },
    {
      content: "You are... but don't tell anyone!",
      role: "assistant",
    },
  ],
};
