import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

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
    mockSettings({
      "token-features": createMockTokenFeatures({ metabot_v3: true }),
    });
    setupEnterprisePlugins();
  });

  describe("when metabot is disabled", () => {
    it("should show disabled button with tooltip", async () => {
      renderWithProviders(<MetabotComponent {...defaultProps} />, {
        storeInitialState: createMockState({
          settings: mockSettings({
            "metabot-enabled?": false,
          }),
        }),
      });

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
      renderWithProviders(<MetabotComponent {...defaultProps} />, {
        storeInitialState: createMockState({
          settings: mockSettings({
            "metabot-enabled?": true,
            "llm-metabot-configured?": true,
          }),
        }),
      });

      const runButton = screen.getByRole("button", { name: /run/i });
      expect(runButton).toBeEnabled();

      await userEvent.hover(runButton);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });
});
