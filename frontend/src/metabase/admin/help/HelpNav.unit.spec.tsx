import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupBugReportingDetailsEndpoint,
  setupHelpAssistantConversationsEndpoints,
  setupTokenStatusEndpointEmpty,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import type { HelpAssistantConversation } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { HelpAssistantChatProvider } from "./HelpAssistant";
import { HelpNav } from "./HelpNav";

const createConversation = (
  title: string,
  updatedAt: string,
): HelpAssistantConversation => ({
  title,
  updated_at: updatedAt,
  messages: [
    { role: "user", content: title },
    { role: "assistant", content: "An answer" },
  ],
});

const setup = ({
  isAdmin = true,
  hasSupportFeature = false,
  conversations = {},
}: {
  isAdmin?: boolean;
  hasSupportFeature?: boolean;
  conversations?: Record<string, HelpAssistantConversation>;
} = {}) => {
  const tokenFeatures = createMockTokenFeatures({
    "support-users": hasSupportFeature,
  });
  mockSettings({ "token-features": tokenFeatures });
  if (hasSupportFeature) {
    setupEnterprisePlugins();
    setupTokenStatusEndpointEmpty();
  }
  setupBugReportingDetailsEndpoint();
  setupHelpAssistantConversationsEndpoints(conversations);

  renderWithProviders(
    <Route
      path="/admin/help/*"
      element={
        <HelpAssistantChatProvider>
          <HelpNav />
        </HelpAssistantChatProvider>
      }
    />,
    {
      withRouter: true,
      initialRoute: "/admin/help",
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: createMockSettingsState({ "token-features": tokenFeatures }),
      }),
    },
  );
};

describe("HelpNav", () => {
  afterEach(() => {
    reinitialize();
  });

  it("shows the help pages and the external links", () => {
    setup();

    expect(
      screen.getByRole("link", { name: /Help assistant/ }),
    ).toHaveAttribute("href", "/admin/help");
    expect(
      screen.getByRole("link", { name: /Diagnostic info/ }),
    ).toHaveAttribute("href", "/admin/help/diagnostics");
    expect(
      screen.getByRole("link", { name: /Docs and support/ }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/www\.metabase\.com\/help\?/),
    );
    expect(
      screen.getByRole("link", { name: /Report an issue/ }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(
        /^https:\/\/github\.com\/metabase\/metabase\/issues\/new/,
      ),
    );
  });

  it("lists saved help assistant chats, newest first", async () => {
    setup({
      conversations: {
        older: createConversation("Why is sync slow?", "2026-10-01T10:00:00Z"),
        newer: createConversation("Set up SSO", "2026-10-02T10:00:00Z"),
      },
    });

    const recentChats = await screen.findByLabelText("Recent chats");
    expect(
      within(recentChats)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Set up SSO", "Why is sync slow?"]);
    expect(
      within(recentChats).getByRole("link", { name: "Set up SSO" }),
    ).toHaveAttribute("href", "/admin/help/chat/newer");
  });

  it("shows the 5 newest chats, and the rest on request", async () => {
    setup({
      conversations: Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7].map((day) => [
          `chat-${day}`,
          createConversation(`Chat ${day}`, `2026-10-0${day}T10:00:00Z`),
        ]),
      ),
    });

    const recentChats = await screen.findByLabelText("Recent chats");
    const getChatTitles = () =>
      within(recentChats)
        .getAllByRole("link")
        .map((link) => link.textContent);
    expect(getChatTitles()).toEqual([
      "Chat 7",
      "Chat 6",
      "Chat 5",
      "Chat 4",
      "Chat 3",
    ]);

    await userEvent.click(
      within(recentChats).getByRole("button", { name: "Show all" }),
    );
    expect(getChatTitles()).toHaveLength(7);
  });

  it("hides the help assistant from people who aren't admins", async () => {
    setup({
      isAdmin: false,
      conversations: {
        older: createConversation("Why is sync slow?", "2026-10-01T10:00:00Z"),
      },
    });

    expect(
      screen.queryByRole("link", { name: /Help assistant/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Recent chats")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Diagnostic info/ }),
    ).toBeInTheDocument();
  });

  it("links admins to the application logs in Monitor", () => {
    setup({ isAdmin: true });

    expect(
      screen.getByRole("link", { name: /Application logs/ }),
    ).toHaveAttribute("href", "/monitor/logs");
  });

  it("hides the application logs from people who can't open them", () => {
    setup({ isAdmin: false });

    expect(
      screen.queryByRole("link", { name: /Application logs/ }),
    ).not.toBeInTheDocument();
  });

  it("hides support access without the support-users feature", () => {
    setup({ hasSupportFeature: false });

    expect(
      screen.queryByRole("link", { name: /Support access/ }),
    ).not.toBeInTheDocument();
  });

  it("shows support access with the support-users feature", () => {
    setup({ hasSupportFeature: true });

    expect(
      screen.getByRole("link", { name: /Support access/ }),
    ).toHaveAttribute("href", "/admin/help/support");
  });
});
