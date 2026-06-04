import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { MetabotChatContext } from "metabase-types/api";

import { MetabotEntityLauncher } from "./MetabotEntityLauncher";

const hasMetabotAccessMock = jest.fn();
const askMock = jest.fn();

jest.mock("metabase/metabot/hooks", () => ({
  useUserMetabotPermissions: () => ({
    hasMetabotAccess: hasMetabotAccessMock(),
  }),
  useAskMetabotAboutCurrentEntity: () => askMock,
  getViewingEntityMention: jest.requireActual(
    "metabase/metabot/hooks/use-ask-metabot-about-current-entity",
  ).getViewingEntityMention,
}));

const getChatContextMock = jest.fn();
jest.mock("metabase/metabot", () => ({
  useMetabotContext: () => ({
    getChatContext: getChatContextMock,
    chatContextProviderVersion: 0,
  }),
}));

const trackMock = jest.fn();
jest.mock("metabase/metabot/analytics", () => ({
  trackMetabotChatOpened: (...args: unknown[]) => trackMock(...args),
}));

const context = (
  userIsViewing: MetabotChatContext["user_is_viewing"],
): MetabotChatContext => ({
  user_is_viewing: userIsViewing,
  current_time_with_timezone: "2026-01-01T00:00:00+00:00",
  capabilities: [],
});

function setup({
  hasMetabotAccess = true,
  userIsViewing = [{ type: "dashboard" as const, id: 1, name: "Dash" }],
}: {
  hasMetabotAccess?: boolean;
  userIsViewing?: MetabotChatContext["user_is_viewing"];
} = {}) {
  hasMetabotAccessMock.mockReturnValue(hasMetabotAccess);
  getChatContextMock.mockResolvedValue(context(userIsViewing));
  renderWithProviders(<MetabotEntityLauncher />);
}

const launcher = () => screen.queryByTestId("metabot-entity-launcher");

describe("MetabotEntityLauncher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the launcher when viewing a mentionable entity", async () => {
    setup();
    expect(await screen.findByTestId("metabot-entity-launcher")).toBeEnabled();
  });

  it("does not show the launcher without metabot access", async () => {
    setup({ hasMetabotAccess: false });
    // give the async context check a chance to (not) resolve
    await Promise.resolve();
    expect(launcher()).not.toBeInTheDocument();
    expect(getChatContextMock).not.toHaveBeenCalled();
  });

  it("does not show the launcher when nothing mentionable is in view", async () => {
    setup({ userIsViewing: [] });
    await waitFor(() => expect(getChatContextMock).toHaveBeenCalled());
    expect(launcher()).not.toBeInTheDocument();
  });

  it("opens metabot about the current entity and tracks the open on click", async () => {
    setup();
    await userEvent.click(await screen.findByTestId("metabot-entity-launcher"));
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("header");
  });
});
