import type { ComponentProps } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
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

function setup(
  props?: Partial<ComponentProps<typeof MetabotInlineSQLPrompt>>,
  options?: { isAdmin?: boolean },
) {
  const { isAdmin = true } = options ?? {};
  const settings = mockSettings({
    "llm-metabot-configured?": false,
    "metabot-enabled?": true,
  });

  setupUserMetabotPermissionsEndpoint();
  setupEnterprisePlugins();

  renderWithProviders(<MetabotInlineSQLPrompt {...defaultProps} {...props} />, {
    storeInitialState: createMockState({
      settings,
      currentUser: createMockUser({ is_superuser: isAdmin }),
    }),
  });
}

describe("MetabotInlineSQLPrompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a configure link instead of submit controls when disabled", async () => {
    setup();

    expect(
      screen.getByText("To use SQL generation, please", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-inline-sql-generate"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "connect to a model" }),
    ).toBeInTheDocument();
  });

  it("shows the admin message when the user cannot configure AI", () => {
    setup(undefined, { isAdmin: false });

    expect(
      screen.getByText(
        "Ask your admin to connect to a model to use SQL generation.",
      ),
    ).toBeInTheDocument();
  });
});
