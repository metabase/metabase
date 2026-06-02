import { renderWithProviders, screen } from "__support__/ui";
import type { MetabotAgentId } from "metabase/metabot/state";
import { createMockState } from "metabase/redux/store/mocks";

import { getMetabotInitialState } from "../../state/reducer-utils";

import { AppContentShell } from "./AppContentShell";

jest.mock("../MetabotBar/MetabotBar", () => ({
  MetabotBar: () => <div data-testid="metabot-bar" />,
}));

jest.mock(
  "metabase/metabot/components/MetabotPage/MetabotConversationView",
  () => ({
    MetabotConversationView: ({ agentId }: { agentId: string }) => (
      <div data-testid="mock-metabot-conversation">{agentId}</div>
    ),
  }),
);

function setup({
  overlayAgentId = null,
  showChrome = true,
}: {
  overlayAgentId?: MetabotAgentId | null;
  showChrome?: boolean;
} = {}) {
  renderWithProviders(
    <AppContentShell showChrome={showChrome}>
      <div data-testid="page-content" />
    </AppContentShell>,
    {
      storeInitialState: createMockState({
        metabot: { ...getMetabotInitialState(), overlayAgentId },
      }),
    },
  );
}

describe("AppContentShell", () => {
  it("renders children and the MetabotBar with no overlay by default", () => {
    setup();
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
    expect(screen.getByTestId("metabot-bar")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-expanded-chat"),
    ).not.toBeInTheDocument();
  });

  it("renders the expanded overlay over the content while keeping the bar mounted", () => {
    setup({ overlayAgentId: "chat_a" });
    expect(screen.getByTestId("metabot-expanded-chat")).toBeInTheDocument();
    expect(screen.getByTestId("mock-metabot-conversation")).toHaveTextContent(
      "chat_a",
    );
    expect(screen.getByTestId("metabot-bar")).toBeInTheDocument();
  });

  it("renders no bar or overlay in bare-chrome mode", () => {
    setup({ overlayAgentId: "chat_a", showChrome: false });
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
    expect(screen.queryByTestId("metabot-bar")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-expanded-chat"),
    ).not.toBeInTheDocument();
  });
});
