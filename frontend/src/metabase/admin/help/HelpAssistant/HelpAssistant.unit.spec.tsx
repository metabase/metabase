import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  HELP_ASSISTANT_ROUTES,
  setupBugReportingDetailsEndpoint,
  setupHelpAssistantChatEndpoint,
  setupHelpAssistantConversationsEndpoints,
  setupHelpAssistantFeedbackEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState, createMockState } from "__support__/state";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import type {
  HelpAssistantChatResponse,
  HelpAssistantConversation,
} from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { HelpLayout } from "../HelpLayout";

import { HelpAssistant } from "./HelpAssistant";

const SOURCE = {
  title: "Troubleshooting database connections",
  url: "https://www.metabase.com/docs/latest/troubleshooting-guide/db-connection",
};

const REPLY: HelpAssistantChatResponse = {
  reply: "Check the **connection string**.",
  sources: [SOURCE],
};

const SAVED_CONVERSATION: HelpAssistantConversation = {
  title: "How often does sync run?",
  updated_at: "2026-10-20T10:00:00.000Z",
  messages: [
    { role: "user", content: "How often does sync run?" },
    { role: "assistant", content: "Sync runs **hourly** by default." },
  ],
};

const setup = ({
  isAdmin = true,
  isConfigured = true,
  chatResponse = REPLY,
  chatDelay,
  conversations = {},
  initialRoute = "/admin/help",
}: {
  isAdmin?: boolean;
  isConfigured?: boolean;
  chatResponse?: HelpAssistantChatResponse | number;
  chatDelay?: number;
  conversations?: Record<string, HelpAssistantConversation>;
  initialRoute?: string;
} = {}) => {
  setupBugReportingDetailsEndpoint();
  setupUserMetabotPermissionsEndpoint();
  setupHelpAssistantChatEndpoint(chatResponse, { delay: chatDelay });
  setupHelpAssistantFeedbackEndpoint();
  setupHelpAssistantConversationsEndpoints(conversations);

  const { router } = renderWithProviders(
    <Route
      path="/admin/help"
      element={
        <>
          <HelpLayout />
          <UndoListing />
        </>
      }
    >
      <Route index element={<HelpAssistant />} />
      <Route path="chat/:conversationId" element={<HelpAssistant />} />
      <Route path="diagnostics" element={<div>Diagnostics page</div>} />
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: createMockSettingsState({
          "llm-metabot-configured?": isConfigured,
        }),
      }),
    },
  );

  return { router: checkNotNull(router) };
};

const getLastRequestBody = async (routeName: string): Promise<unknown> =>
  fetchMock.callHistory.lastCall(routeName)?.request?.json();

const mockClipboard = () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
};

const ask = async (question: string) => {
  await userEvent.type(
    screen.getByLabelText("Ask the help assistant"),
    `${question}{Enter}`,
  );
};

const getRecentChats = () => screen.getByLabelText("Recent chats");

describe("HelpAssistant", () => {
  it("shows a greeting, suggested prompts, and a link to the diagnostic info", () => {
    setup();

    expect(
      screen.getByRole("heading", { name: "How can we help?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "My database connection stopped working",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "diagnostic info" }),
    ).toHaveAttribute("href", "/admin/help/diagnostics");
  });

  it("sends a suggested prompt with the diagnostic info and shows the reply", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", {
        name: "My database connection stopped working",
      }),
    );

    expect(await screen.findByText("connection string")).toBeInTheDocument();
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Troubleshooting database connections",
      }),
    ).toBeInTheDocument();
    expect(await getLastRequestBody(HELP_ASSISTANT_ROUTES.chat)).toEqual({
      messages: [
        { role: "user", content: "My database connection stopped working" },
      ],
      diagnostic_info: expect.stringContaining("browser-info"),
    });
  });

  it("leaves out the diagnostic info when it's turned off", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("checkbox", { name: /Include diagnostic info/ }),
    );
    await ask("Why is sync slow?");

    await screen.findByText("connection string");
    expect(await getLastRequestBody(HELP_ASSISTANT_ROUTES.chat)).toEqual({
      messages: [{ role: "user", content: "Why is sync slow?" }],
    });
  });

  it("sends a typed question with Enter", async () => {
    setup();

    await ask("Why is sync slow?");

    expect(await screen.findByText("connection string")).toBeInTheDocument();
    expect(screen.getByRole("log", { name: "Conversation" })).toHaveTextContent(
      "Why is sync slow?",
    );
  });

  it("goes back to the greeting for a new chat", async () => {
    setup();

    await ask("Why is sync slow?");
    await screen.findByText("connection string");
    await userEvent.click(screen.getByRole("button", { name: /New chat/ }));

    expect(
      screen.getByRole("heading", { name: "How can we help?" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("log", { name: "Conversation" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a question that waits for its first answer after opening the diagnostic info and coming back", async () => {
    setup({ chatDelay: 60_000 });

    await ask("Why is sync slow?");
    expect(await screen.findByText("Working on it…")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("link", { name: "diagnostic info" }),
    );
    expect(await screen.findByText("Diagnostics page")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: /Help assistant/ }));
    expect(await screen.findByText("Working on it…")).toBeInTheDocument();
    expect(screen.getByRole("log", { name: "Conversation" })).toHaveTextContent(
      "Why is sync slow?",
    );

    // Don't leave the request open after the test.
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
  });

  it("shows an error and asks the same question again on retry", async () => {
    setup({ chatResponse: 500 });

    await ask("Why is sync slow?");
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();

    fetchMock.modifyRoute(HELP_ASSISTANT_ROUTES.chat, { response: REPLY });
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));

    expect(await screen.findByText("connection string")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    expect(await getLastRequestBody(HELP_ASSISTANT_ROUTES.chat)).toEqual(
      expect.objectContaining({
        messages: [{ role: "user", content: "Why is sync slow?" }],
      }),
    );
  });

  it("keeps the input enabled while waiting, and puts the question back when stopped", async () => {
    setup({ chatDelay: 60_000 });

    await ask("Why is sync slow?");
    expect(await screen.findByText("Working on it…")).toBeInTheDocument();
    expect(screen.getByLabelText("Ask the help assistant")).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(screen.getByLabelText("Ask the help assistant")).toHaveValue(
      "Why is sync slow?",
    );
    expect(screen.queryByText("Working on it…")).not.toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  it("copies an answer as Markdown", async () => {
    const writeText = mockClipboard();
    setup();

    await ask("Why is sync slow?");
    await screen.findByText("connection string");
    await userEvent.click(
      screen.getByRole("button", { name: "Copy as Markdown" }),
    );

    expect(writeText).toHaveBeenCalledWith(
      `Check the **connection string**.\n\nSources:\n- [${SOURCE.title}](${SOURCE.url})`,
    );
  });

  it("copies the whole conversation as Markdown", async () => {
    const writeText = mockClipboard();
    setup();

    await ask("Why is sync slow?");
    await screen.findByText("connection string");
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Copy conversation/ }),
    );

    expect(writeText).toHaveBeenCalledWith(
      `Metabase version: v1\n\n**Question:**\nWhy is sync slow?\n\n**Help assistant:**\nCheck the **connection string**.\n\nSources:\n- [${SOURCE.title}](${SOURCE.url})`,
    );
  });

  it("saves the conversation and lists it under recent chats", async () => {
    setup();

    await ask("Why is sync slow?");
    await screen.findByText("connection string");

    expect(
      await getLastRequestBody(HELP_ASSISTANT_ROUTES.saveConversation),
    ).toEqual({
      value: {
        title: "Why is sync slow?",
        updated_at: expect.any(String),
        messages: [
          { role: "user", content: "Why is sync slow?" },
          {
            role: "assistant",
            content: REPLY.reply,
            sources: REPLY.sources,
          },
        ],
      },
    });

    await userEvent.click(screen.getByRole("button", { name: /New chat/ }));
    await userEvent.click(
      within(getRecentChats()).getByRole("link", {
        name: "Why is sync slow?",
      }),
    );
    expect(await screen.findByText("connection string")).toBeInTheDocument();
  });

  it("gives a saved chat its own URL", async () => {
    const { router } = setup();

    await ask("Why is sync slow?");
    await screen.findByText("connection string");

    await waitFor(() =>
      expect(router.location.pathname).toMatch(/^\/admin\/help\/chat\/.+/),
    );
    expect(
      within(getRecentChats()).getByRole("link", { name: "Why is sync slow?" }),
    ).toHaveAttribute("href", router.location.pathname);
  });

  it("opens a saved chat from its URL", async () => {
    setup({
      conversations: { "saved-chat": SAVED_CONVERSATION },
      initialRoute: "/admin/help/chat/saved-chat",
    });

    expect(await screen.findByText("hourly")).toBeInTheDocument();
  });

  it("goes to a new chat when the chat in the URL doesn't exist", async () => {
    const { router } = setup({
      conversations: { "saved-chat": SAVED_CONVERSATION },
      initialRoute: "/admin/help/chat/missing-chat",
    });

    await waitFor(() => expect(router.location.pathname).toBe("/admin/help"));
    expect(
      screen.getByRole("heading", { name: "How can we help?" }),
    ).toBeInTheDocument();
  });

  it("starts a new chat from the Help assistant link while a saved chat is open", async () => {
    setup({
      conversations: { "saved-chat": SAVED_CONVERSATION },
      initialRoute: "/admin/help/chat/saved-chat",
    });
    await screen.findByText("hourly");

    await userEvent.click(screen.getByRole("link", { name: /Help assistant/ }));

    expect(
      await screen.findByRole("heading", { name: "How can we help?" }),
    ).toBeInTheDocument();
  });

  it("goes between saved chats with the browser's back button", async () => {
    const { router } = setup({
      conversations: {
        "saved-chat": SAVED_CONVERSATION,
        "other-chat": {
          title: "Set up SSO",
          updated_at: "2026-10-21T10:00:00.000Z",
          messages: [
            { role: "user", content: "Set up SSO" },
            { role: "assistant", content: "Use **SAML**." },
          ],
        },
      },
      initialRoute: "/admin/help/chat/saved-chat",
    });
    await screen.findByText("hourly");

    await userEvent.click(
      within(getRecentChats()).getByRole("link", { name: "Set up SSO" }),
    );
    expect(await screen.findByText("SAML")).toBeInTheDocument();

    router.back();
    expect(await screen.findByText("hourly")).toBeInTheDocument();
  });

  it("opens and deletes a saved conversation", async () => {
    setup({ conversations: { "saved-chat": SAVED_CONVERSATION } });

    await userEvent.click(
      await within(await screen.findByLabelText("Recent chats")).findByRole(
        "link",
        { name: "How often does sync run?" },
      ),
    );
    expect(await screen.findByText("hourly")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete chat/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "How can we help?" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Chat deleted")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.callHistory.lastCall(HELP_ASSISTANT_ROUTES.deleteConversation)
          ?.url,
      ).toMatch(/\/key\/saved-chat$/),
    );
    expect(screen.queryByLabelText("Recent chats")).not.toBeInTheDocument();
  });

  it("brings a deleted chat back with Undo", async () => {
    setup({
      conversations: { "saved-chat": SAVED_CONVERSATION },
      initialRoute: "/admin/help/chat/saved-chat",
    });
    await screen.findByText("hourly");

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete chat/ }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));

    expect(await screen.findByText("hourly")).toBeInTheDocument();
    expect(
      await getLastRequestBody(HELP_ASSISTANT_ROUTES.saveConversation),
    ).toEqual({ value: SAVED_CONVERSATION });
    expect(
      within(getRecentChats()).getByRole("link", {
        name: "How often does sync run?",
      }),
    ).toBeInTheDocument();
  });

  it("marks only the open chat as active in the sidebar", async () => {
    setup({ conversations: { "saved-chat": SAVED_CONVERSATION } });

    const assistantLink = screen.getByRole("link", { name: /Help assistant/ });
    expect(assistantLink).toHaveAttribute("data-active", "true");

    const savedChat = await within(
      await screen.findByLabelText("Recent chats"),
    ).findByRole("link", { name: "How often does sync run?" });
    await userEvent.click(savedChat);
    await screen.findByText("hourly");

    expect(savedChat).toHaveAttribute("data-active", "true");
    expect(assistantLink).not.toHaveAttribute("data-active");

    await userEvent.click(screen.getByRole("button", { name: /New chat/ }));

    await waitFor(() =>
      expect(assistantLink).toHaveAttribute("data-active", "true"),
    );
    expect(savedChat).not.toHaveAttribute("data-active");
  });

  it("asks for a follow-up question after the first answer", async () => {
    setup();

    expect(screen.getByLabelText("Ask the help assistant")).toHaveAttribute(
      "placeholder",
      "e.g. Why does my dashboard take a minute to load?",
    );

    await ask("Why is sync slow?");
    await screen.findByText("connection string");

    expect(screen.getByLabelText("Ask the help assistant")).toHaveAttribute(
      "placeholder",
      "Ask a follow-up question",
    );
  });

  it("sends positive and negative feedback on an answer", async () => {
    setup();

    await ask("Why is sync slow?");
    await screen.findByText("connection string");

    await userEvent.click(screen.getByRole("button", { name: "Helpful" }));
    expect(await getLastRequestBody(HELP_ASSISTANT_ROUTES.feedback)).toEqual({
      positive: true,
      question: "Why is sync slow?",
      answer: REPLY.reply,
      sources: REPLY.sources,
    });
    expect(screen.getByRole("button", { name: "Helpful" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: "Not helpful" }));
    await userEvent.type(
      await screen.findByLabelText("What went wrong? (optional)"),
      "It skipped the SSL settings",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );

    await waitFor(async () =>
      expect(await getLastRequestBody(HELP_ASSISTANT_ROUTES.feedback)).toEqual(
        expect.objectContaining({
          positive: false,
          comment: "It skipped the SSL settings",
        }),
      ),
    );
  });

  it("asks to connect a model when no AI provider is set up", async () => {
    setup({ isConfigured: false });

    expect(await screen.findByText(/connect to a model/)).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Ask the help assistant"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "My database connection stopped working",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(
      screen.queryByRole("checkbox", { name: /Include diagnostic info/ }),
    ).not.toBeInTheDocument();
  });

  it("doesn't send a question while an input method editor composes a word", async () => {
    setup();

    const input = screen.getByLabelText("Ask the help assistant");
    await userEvent.type(input, "nihongo");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(input).toHaveValue("nihongo");
    expect(
      fetchMock.callHistory.called(HELP_ASSISTANT_ROUTES.chat),
    ).toBeFalsy();
  });

  it("keeps a rating given while the next answer loads", async () => {
    setup();

    await ask("Why is sync slow?");
    await screen.findByText("connection string");

    let sendSecondReply = () => {};
    fetchMock.modifyRoute(HELP_ASSISTANT_ROUTES.chat, {
      response: () =>
        new Promise((resolve) => {
          sendSecondReply = () =>
            resolve({ reply: "Turn on **SSL**.", sources: [] });
        }),
    });
    await ask("Still slow");
    await screen.findByText("Working on it…");
    await userEvent.click(screen.getByRole("button", { name: "Helpful" }));

    sendSecondReply();
    expect(await screen.findByText("SSL")).toBeInTheDocument();

    expect(
      screen.getAllByRole("button", { name: "Helpful" })[0],
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await getLastRequestBody(HELP_ASSISTANT_ROUTES.saveConversation),
    ).toEqual({
      value: expect.objectContaining({
        messages: [
          { role: "user", content: "Why is sync slow?" },
          expect.objectContaining({ feedback: { positive: true } }),
          { role: "user", content: "Still slow" },
          { role: "assistant", content: "Turn on **SSL**.", sources: [] },
        ],
      }),
    });
  });

  it("sends a positive rating once, and says thanks", async () => {
    setup();

    await ask("Why is sync slow?");
    await screen.findByText("connection string");
    await userEvent.click(screen.getByRole("button", { name: "Helpful" }));
    await userEvent.click(screen.getByRole("button", { name: "Helpful" }));

    expect(
      await screen.findByText("Thanks for the feedback"),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(HELP_ASSISTANT_ROUTES.feedback),
    ).toHaveLength(1);
  });

  it("sends people who aren't admins to the diagnostic info", async () => {
    setup({ isAdmin: false });

    expect(await screen.findByText("Diagnostics page")).toBeInTheDocument();
  });
});
