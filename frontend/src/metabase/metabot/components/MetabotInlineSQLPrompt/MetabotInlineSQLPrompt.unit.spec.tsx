import type { ComponentProps } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { MetabotAgentTurnDisplayError } from "metabase/metabot/state";
import { createMockUser } from "metabase-types/api/mocks";

import { MetabotInlineSQLPrompt } from "./MetabotInlineSQLPrompt";

const defaultProps: ComponentProps<typeof MetabotInlineSQLPrompt> = {
  databaseId: 1,
  onClose: jest.fn(),
  isLoading: false,
  error: undefined,
  generate: jest.fn(),
  cancelRequest: jest.fn(),
  suggestionModels: [],
  getSourceSql: jest.fn(() => "select 1"),
  value: "",
  onValueChange: jest.fn(),
};

interface SetupOpts {
  props?: Partial<ComponentProps<typeof MetabotInlineSQLPrompt>>;
  isAdmin?: boolean;
  isConfigured?: boolean;
}

function setup({
  props,
  isAdmin = true,
  isConfigured = false,
}: SetupOpts = {}) {
  const settings = mockSettings({
    "llm-metabot-configured?": isConfigured,
    "metabot-enabled?": true,
  });

  setupUserMetabotPermissionsEndpoint();
  setupEnterprisePlugins();

  const { rerender } = renderWithProviders(
    <MetabotInlineSQLPrompt {...defaultProps} {...props} />,
    {
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );

  return {
    rerender: (nextProps: SetupOpts["props"]) =>
      rerender(<MetabotInlineSQLPrompt {...defaultProps} {...nextProps} />),
  };
}

describe("MetabotInlineSQLPrompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a configure link instead of submit controls when disabled", async () => {
    setup();

    expect(
      await screen.findByText(/To use SQL generation, please/),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-inline-sql-generate"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "connect to a model" }),
    ).toBeInTheDocument();
  });

  it("shows the admin message when the user cannot configure AI", async () => {
    setup({ isAdmin: false });

    expect(
      await screen.findByText(
        "Ask your admin to connect to a model to use SQL generation.",
      ),
    ).toBeInTheDocument();
  });

  it.each<{ replacement: string; error: MetabotAgentTurnDisplayError }>([
    {
      replacement: "error",
      error: { type: "message", message: "Sorry, I ran into an error." },
    },
    {
      replacement: "interruption notice",
      error: {
        type: "aborted",
        message: "Response from Metabot was interrupted",
      },
    },
  ])(
    "replaces the working status with the $replacement when loading ends",
    async ({ error }) => {
      const { rerender } = setup({
        props: { isLoading: true },
        isConfigured: true,
      });
      expect(
        await screen.findByRole("button", { name: "Stop generating" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Working on it...");

      rerender({ isLoading: false, error });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByText(error.message)).toBeInTheDocument();
    },
  );
});
