import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_METABOT } from "metabase/plugins";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { CommandSuggestion } from "./CommandSuggestion";

describe("CommandSuggestion", () => {
  const defaultProps = {
    items: [],
    command: jest.fn(),
    editor: {} as any,
    query: "",
    range: { from: 0, to: 0 },
  };

  const expectStandardCommandsToBePresent = () => {
    // Main commands
    expect(screen.getByText("Chart")).toBeInTheDocument();
    expect(screen.getByText("Link")).toBeInTheDocument();

    // Formatting commands
    expect(screen.getByText("Heading 1")).toBeInTheDocument();
    expect(screen.getByText("Heading 2")).toBeInTheDocument();
    expect(screen.getByText("Heading 3")).toBeInTheDocument();
    expect(screen.getByText("Bullet list")).toBeInTheDocument();
    expect(screen.getByText("Numbered list")).toBeInTheDocument();
    expect(screen.getByText("Quote")).toBeInTheDocument();
    expect(screen.getByText("Code block")).toBeInTheDocument();
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when metabot is disabled", () => {
    beforeEach(() => {
      PLUGIN_METABOT.isEnabled = jest.fn(() => false);
    });

    it("should show all available commands except Metabot", () => {
      const settings = mockSettings({
        "token-features": createMockTokenFeatures({
          metabot_v3: false,
        }),
      });

      renderWithProviders(<CommandSuggestion {...defaultProps} />, {
        storeInitialState: createMockState({
          settings,
        }),
      });

      expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
      expectStandardCommandsToBePresent();
    });
  });

  describe("when metabot is enabled", () => {
    beforeEach(() => {
      PLUGIN_METABOT.isEnabled = jest.fn(() => true);
    });

    it("should show all available commands including Metabot", () => {
      const settings = mockSettings({
        "token-features": createMockTokenFeatures({
          metabot_v3: true,
        }),
      });

      renderWithProviders(<CommandSuggestion {...defaultProps} />, {
        storeInitialState: createMockState({
          settings,
        }),
      });

      expect(screen.getByText("Ask Metabot")).toBeInTheDocument();
      expectStandardCommandsToBePresent();
    });
  });
});
