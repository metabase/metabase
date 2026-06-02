import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";

import { MetabotLauncher } from "./MetabotLauncher";

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useUserMetabotPermissions: jest.fn(),
}));

// The popup renders the full MetabotChat surface, which isn't under test here.
jest.mock("./MetabotPanel", () => ({
  MetabotPanel: ({ agentId }: { agentId: string }) => (
    <div data-testid="metabot-panel-stub">{agentId}</div>
  ),
}));

function setup({
  hasMetabotAccess = true,
}: { hasMetabotAccess?: boolean } = {}) {
  jest
    .mocked(useUserMetabotPermissions)
    .mockReturnValue({ hasMetabotAccess } as any);

  return renderWithProviders(<MetabotLauncher />, {
    storeInitialState: createMockState({ currentUser: createMockUser() }),
  });
}

const chatConversationCount = (store: { getState: () => any }) =>
  Object.keys(store.getState().metabot.conversations).filter((id) =>
    id.startsWith("chat_"),
  ).length;

describe("MetabotLauncher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the Ask Metabot button when the user has access", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Ask Metabot" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("metabot-panel-stub")).not.toBeInTheDocument();
  });

  it("renders nothing when the user has no Metabot access", () => {
    setup({ hasMetabotAccess: false });
    expect(
      screen.queryByRole("button", { name: "Ask Metabot" }),
    ).not.toBeInTheDocument();
  });

  it("toggles the popup panel open and closed on click", async () => {
    setup();
    const button = screen.getByRole("button", { name: "Ask Metabot" });

    await userEvent.click(button);
    expect(await screen.findByTestId("metabot-panel-stub")).toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.queryByTestId("metabot-panel-stub")).not.toBeInTheDocument();
  });

  it("discards the chat from history when closed without sending a message", async () => {
    const { store } = setup();
    const button = screen.getByRole("button", { name: "Ask Metabot" });

    await userEvent.click(button);
    expect(chatConversationCount(store)).toBe(1);

    await userEvent.click(button);
    expect(chatConversationCount(store)).toBe(0);
  });
});
