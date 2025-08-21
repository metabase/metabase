import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { PLUGIN_METABOT } from "metabase/plugins";
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
  });

  describe("when metabot is disabled", () => {
    beforeEach(() => {
      PLUGIN_METABOT.isEnabled = jest.fn(() => false);
    });

    it("should show disabled button with tooltip", async () => {
      const settings = mockSettings({
        "token-features": createMockTokenFeatures({
          metabot_v3: false,
        }),
      });

      renderWithProviders(<MetabotComponent {...defaultProps} />, {
        storeInitialState: createMockState({
          settings,
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
    beforeEach(() => {
      PLUGIN_METABOT.isEnabled = jest.fn(() => true);
    });

    it("should show enabled button without tooltip", async () => {
      const settings = mockSettings({
        "token-features": createMockTokenFeatures({
          metabot_v3: true,
        }),
      });

      renderWithProviders(<MetabotComponent {...defaultProps} />, {
        storeInitialState: createMockState({
          settings,
        }),
      });

      const runButton = screen.getByRole("button", { name: /run/i });
      expect(runButton).toBeEnabled();

      await userEvent.hover(runButton);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });
});
