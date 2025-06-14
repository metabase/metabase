import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { FixSqlQueryButton } from "./FixSqlQueryButton";

// Mock the useMetabotAgent hook
const mockStartNewConversation = jest.fn();
jest.mock("metabase-enterprise/metabot/hooks", () => ({
  useMetabotAgent: () => ({
    startNewConversation: mockStartNewConversation,
  }),
}));

function setup() {
  renderWithProviders(<FixSqlQueryButton />);
}

describe("FixSqlQueryButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render the button with correct text", () => {
    setup();
    expect(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    ).toBeInTheDocument();
  });

  it("should start a new conversation when clicked", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(mockStartNewConversation).toHaveBeenCalledWith("Fix this SQL query");
  });
});
