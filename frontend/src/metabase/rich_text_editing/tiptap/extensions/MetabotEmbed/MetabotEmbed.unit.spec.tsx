import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { createScenario } from "__support__/scenarios";
import { screen, waitFor, within } from "__support__/ui";
import { createMockUserMetabotPermissions } from "metabase-types/api/mocks";

import { MetabotComponent } from "./MetabotEmbed";
import {
  createMockExtension,
  createMockNodeViewProps,
  createMockProseMirrorNode,
} from "./__support__/node-view-mocks";

describe("MetabotEmbed", () => {
  const defaultProps = createMockNodeViewProps({
    node: createMockProseMirrorNode({
      textContent: "Test prompt",
      content: { content: [] },
    }),
    extension: createMockExtension({
      options: {
        serializePrompt: jest.fn(),
      },
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.get(
      "path:/api/metabot/permissions/user-permissions",
      createMockUserMetabotPermissions(),
    );
    createScenario()
      .withEnterprise({ tokenFeatures: { ai_controls: true } })
      .build();
    setupEnterprisePlugins();
  });

  describe("when metabot is disabled", () => {
    it("should show disabled button with tooltip", async () => {
      const { render } = createScenario()
        .withSettings({ "metabot-enabled?": false })
        .build();
      render(<MetabotComponent {...defaultProps} />);

      const runButton = screen.getByRole("button", { name: /run/i });
      expect(runButton).toBeDisabled();

      await userEvent.hover(runButton);
      const tooltip = await screen.findByRole("tooltip");
      expect(
        within(tooltip).getByText("Metabot is disabled"),
      ).toBeInTheDocument();
    });
  });

  describe("when metabot is enabled", () => {
    it("should show enabled button without tooltip", async () => {
      const { render } = createScenario()
        .withSettings({
          "metabot-enabled?": true,
          "llm-metabot-configured?": true,
        })
        .build();
      render(<MetabotComponent {...defaultProps} />);

      const runButton = screen.getByRole("button", { name: /run/i });
      await waitFor(() => expect(runButton).toBeEnabled());

      await userEvent.hover(runButton);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });
});
