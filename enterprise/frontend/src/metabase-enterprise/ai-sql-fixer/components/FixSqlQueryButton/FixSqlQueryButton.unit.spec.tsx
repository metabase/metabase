import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { FixSqlQueryButton } from "./FixSqlQueryButton";

// Mock the useMetabotAgent hook
const mockSubmitInput = jest.fn();
jest.mock("metabase-enterprise/metabot/hooks", () => ({
  useMetabotAgent: () => ({
    submitInput: mockSubmitInput,
  }),
}));

function setup({
  isMetabotEnabled = true,
}: { isMetabotEnabled?: boolean } = {}) {
  const settings = mockSettings({
    "metabot-enabled?": isMetabotEnabled,
    "token-features": createMockTokenFeatures({
      metabot_v3: true,
    }),
  });

  renderWithProviders(<FixSqlQueryButton />, {
    storeInitialState: createMockState({ settings }),
  });
}

describe("FixSqlQueryButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it("should submit a prompt to the metabot agent when clicked", async () => {
    setup({ isMetabotEnabled: true });

    await userEvent.click(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(mockSubmitInput).toHaveBeenCalledWith("Fix this SQL query");
  });
});
