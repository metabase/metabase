import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { mockStreamedEndpoint } from "metabase-enterprise/api/ai-streaming/test-utils";
import { createMockSettings } from "metabase-types/api/mocks";

import { FixSqlQueryButton } from "./FixSqlQueryButton";

const mockAgentEndpoint = (
  params: Parameters<typeof mockStreamedEndpoint>[1],
) => mockStreamedEndpoint("/api/ee/metabot-v3/v2/agent-streaming", params);

const setup = ({ metabotFeatureEnabled = true } = {}) => {
  setupEnterprisePlugins();
  setupPropertiesEndpoints(
    createMockSettings({ "metabot-feature-enabled": metabotFeatureEnabled }),
  );
  renderWithProviders(<FixSqlQueryButton />);
};

describe("FixSqlQueryButton", () => {
  it("should render the button with correct text", async () => {
    setup();
    expect(
      await screen.findByRole("button", { name: /Have Metabot fix it/ }),
    ).toBeInTheDocument();
  });

  // TODO: we should have better tests around this feature, but this is a start
  it("should submit a prompt to the metabot agent when clicked", async () => {
    setup();
    const spy = mockAgentEndpoint({
      textChunks: [
        `0:"Fixed your SQL query!"`,
        `d:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":10}}`,
      ],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(spy).toHaveBeenCalled();
  });

  it("should not render the button when metabot is disabled", () => {
    setup({ metabotFeatureEnabled: false });
    expect(
      screen.queryByRole("button", { name: /Have Metabot fix it/ }),
    ).not.toBeInTheDocument();
  });
});
