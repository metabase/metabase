import { renderWithProviders, screen } from "__support__/ui";

import { AppContentShell } from "./AppContentShell";

let keyHandlers: Record<string, (e: KeyboardEvent) => void> = {};
jest.mock("tinykeys", () => ({
  tinykeys: (_target: unknown, handlers: typeof keyHandlers) => {
    keyHandlers = handlers;
    return () => {
      keyHandlers = {};
    };
  },
}));

const pushMock = jest.fn((..._args: unknown[]) => ({ type: "MOCK_PUSH" }));
jest.mock("react-router-redux", () => ({
  push: (...args: unknown[]) => pushMock(...args),
}));

const hasMetabotAccessMock = jest.fn();
jest.mock("metabase/metabot/hooks", () => ({
  useUserMetabotPermissions: () => ({
    hasMetabotAccess: hasMetabotAccessMock(),
  }),
}));

jest.mock("metabase/metabot/analytics", () => ({
  trackMetabotChatOpened: jest.fn(),
}));

jest.mock("metabase/metabot/components/MetabotEntityLauncher", () => ({
  MetabotEntityLauncher: () => (
    <div data-testid="metabot-entity-launcher-mock" />
  ),
}));

function setup({
  showChrome = true,
  hasMetabotAccess = true,
}: { showChrome?: boolean; hasMetabotAccess?: boolean } = {}) {
  hasMetabotAccessMock.mockReturnValue(hasMetabotAccess);
  renderWithProviders(
    <AppContentShell showChrome={showChrome}>
      <div data-testid="page-content" />
    </AppContentShell>,
  );
}

describe("AppContentShell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    keyHandlers = {};
  });

  it("renders children with chrome", () => {
    setup();
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });

  it("renders children in bare-chrome mode", () => {
    setup({ showChrome: false });
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });

  it("renders the entity launcher with chrome", () => {
    setup({ showChrome: true });
    expect(
      screen.getByTestId("metabot-entity-launcher-mock"),
    ).toBeInTheDocument();
  });

  it("does not render the entity launcher in bare-chrome mode", () => {
    setup({ showChrome: false });
    expect(
      screen.queryByTestId("metabot-entity-launcher-mock"),
    ).not.toBeInTheDocument();
  });

  it("navigates home on the metabot shortcut when chrome and access are present", () => {
    setup({ showChrome: true, hasMetabotAccess: true });
    keyHandlers["$mod+e"]?.(new KeyboardEvent("keydown"));
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("does not register the shortcut without metabot access", () => {
    setup({ showChrome: true, hasMetabotAccess: false });
    expect(keyHandlers["$mod+e"]).toBeUndefined();
  });

  it("does not register the shortcut in bare-chrome mode", () => {
    setup({ showChrome: false, hasMetabotAccess: true });
    expect(keyHandlers["$mod+e"]).toBeUndefined();
  });
});
