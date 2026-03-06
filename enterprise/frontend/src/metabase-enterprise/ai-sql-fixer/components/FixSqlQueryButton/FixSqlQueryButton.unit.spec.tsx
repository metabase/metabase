import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { trackQueryFixClicked } from "../../analytics";

import { FixSqlQueryButton } from "./FixSqlQueryButton";

const mockSubmitInput = jest.fn();

jest.mock("../../analytics", () => ({
  trackQueryFixClicked: jest.fn(),
}));

jest.mock("metabase-enterprise/metabot/hooks", () => ({
  useMetabotAgent: jest.fn(),
}));

function setup(options?: {
  isMetabotEnabled?: boolean;
  isDoingScience?: boolean;
}) {
  const { isMetabotEnabled = true, isDoingScience = false } = options ?? {};
  const settings = mockSettings({
    "metabot-enabled?": isMetabotEnabled,
    "token-features": createMockTokenFeatures({
      metabot_v3: true,
    }),
  });

  jest.mocked(useMetabotAgent).mockReturnValue({
    submitInput: mockSubmitInput,
    isDoingScience,
  } as any);

  renderWithProviders(<FixSqlQueryButton />, {
    storeInitialState: createMockState({ settings }),
  });
}

describe("FixSqlQueryButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitInput.mockResolvedValue(undefined);
  });

  it("should render the button with correct text when metabot is enabled", () => {
    setup({ isMetabotEnabled: true });
    expect(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    ).toBeInTheDocument();
    expect(useMetabotAgent).toHaveBeenCalledWith("sql");
  });

  it("should not render the button when metabot is disabled", () => {
    setup({ isMetabotEnabled: false });
    expect(
      screen.queryByRole("button", { name: /Have Metabot fix it/ }),
    ).not.toBeInTheDocument();
  });

  it("should submit an SQL fix prompt when clicked", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(trackQueryFixClicked).toHaveBeenCalled();
    expect(mockSubmitInput).toHaveBeenCalledWith("Fix this SQL query");
  });

  it("should show a loading state while the SQL agent is processing", () => {
    setup({ isDoingScience: true });

    expect(
      screen.getByRole("button", {
        name: /Have Metabot fix it/,
      }),
    ).toBeDisabled();
  });
});
