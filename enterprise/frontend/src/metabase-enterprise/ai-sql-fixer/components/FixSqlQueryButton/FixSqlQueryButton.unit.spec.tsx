import userEvent from "@testing-library/user-event";
import { assocIn } from "icepick";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { mockStreamedEndpoint } from "metabase/api/ai-streaming/test-utils";
import { MetabotProvider } from "metabase/metabot/context";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import { createMockState } from "metabase-types/store/mocks";

import { FixSqlQueryButton } from "./FixSqlQueryButton";

function setup({
  isMetabotEnabled = true,
  isProcessing = false,
}: { isMetabotEnabled?: boolean; isProcessing?: boolean } = {}) {
  setupEnterprisePlugins();

  const settings = mockSettings({ "metabot-enabled?": isMetabotEnabled });

  let metabotState = getMetabotInitialState();
  if (isProcessing) {
    metabotState = assocIn(
      metabotState,
      ["conversations", "sql", "isProcessing"],
      true,
    );
  }

  const agentSpy = mockStreamedEndpoint("/api/metabot/agent-streaming", {
    textChunks: [
      `0:"Fixed query."`,
      `d:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":5}}`,
    ],
  });

  renderWithProviders(
    <MetabotProvider>
      <FixSqlQueryButton />
    </MetabotProvider>,
    {
      storeInitialState: createMockState({
        settings,
        metabot: metabotState,
      }),
    },
  );

  return { agentSpy };
}

describe("FixSqlQueryButton", () => {
  it("should render the button with correct text when metabot is enabled", () => {
    setup({ isMetabotEnabled: true });
    expect(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    ).toBeInTheDocument();
  });

  it("should not render the button when metabot is disabled", () => {
    setup({ isMetabotEnabled: false });
    expect(
      screen.queryByRole("button", { name: /Have Metabot fix it/ }),
    ).not.toBeInTheDocument();
  });

  it("should submit an SQL fix prompt when clicked", async () => {
    const { agentSpy } = setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    );

    await waitFor(() => expect(agentSpy).toHaveBeenCalled());

    const body = JSON.parse(agentSpy.mock.lastCall?.[1]?.body as string);
    expect(body.message).toBe("Fix this SQL query");
  });

  it("should show a loading state while the SQL agent is processing", () => {
    setup({ isProcessing: true });

    expect(
      screen.getByRole("button", {
        name: /Have Metabot fix it/,
      }),
    ).toBeDisabled();
  });
});
