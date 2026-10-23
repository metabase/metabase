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
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { Route } from "metabase/router";
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
  isConfigured = true,
  chatResponse = REPLY,
  chatDelay,
  conversations = {},
}: {
  isConfigured?: boolean;
  chatResponse?: HelpAssistantChatResponse | number;
  chatDelay?: number;
  conversations?: Record<string, HelpAssistantConversation>;
} = {}) => {
  setupBugReportingDetailsEndpoint();
  setupUserMetabotPermissionsEndpoint();
  setupHelpAssistantChatEndpoint(chatResponse, { delay: chatDelay });
  setupHelpAssistantFeedbackEndpoint();
  setupHelpAssistantConversationsEndpoints(conversations);

  renderWithProviders(
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
      <Route path="diagnostics" element={<div>Diagnostics page</div>} />
    </Route>,
    {
      withRouter: true,
      initialRoute: "/admin/help",
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: createMockSettingsState({
          "llm-metabot-configured?": isConfigured,
        }),
      }),
    },
  );
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

  it("keeps the conversation after opening the diagnostic info and coming back", async () => {
    setup();

    await ask("Why is sync slow?");
    await screen.findByText("connection string");

    await userEvent.click(
      screen.getByRole("link", { name: "diagnostic info" }),
    );
    expect(await screen.findByText("Diagnostics page")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: /Help assistant/ }));
    expect(await screen.findByText("connection string")).toBeInTheDocument();
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
      `> Why is sync slow?\n\nCheck the **connection string**.\n\nSources:\n- [${SOURCE.title}](${SOURCE.url})`,
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
      within(getRecentChats()).getByRole("button", {
        name: "Why is sync slow?",
      }),
    );
    expect(await screen.findByText("connection string")).toBeInTheDocument();
  });

  it("opens and deletes a saved conversation", async () => {
    setup({ conversations: { "saved-chat": SAVED_CONVERSATION } });

    await userEvent.click(
      await within(await screen.findByLabelText("Recent chats")).findByRole(
        "button",
        { name: "How often does sync run?" },
      ),
    );
    expect(await screen.findByText("hourly")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete chat/ }),
    );

    expect(
      screen.getByRole("heading", { name: "How can we help?" }),
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

  it("marks only the open chat as active in the sidebar", async () => {
    setup({ conversations: { "saved-chat": SAVED_CONVERSATION } });

    const assistantLink = screen.getByRole("link", { name: /Help assistant/ });
    expect(assistantLink).toHaveAttribute("data-active", "true");

    const savedChat = await within(
      await screen.findByLabelText("Recent chats"),
    ).findByRole("button", { name: "How often does sync run?" });
    await userEvent.click(savedChat);
    await screen.findByText("hourly");

    expect(savedChat).toHaveAttribute("data-active", "true");
    expect(assistantLink).not.toHaveAttribute("data-active");

    await userEvent.click(screen.getByRole("button", { name: /New chat/ }));

    expect(assistantLink).toHaveAttribute("data-active", "true");
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
  });
});
