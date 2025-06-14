import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { DASHBOARD_NAME_MAX_LENGTH } from "metabase/dashboard/constants";
import { maxLengthErrorMessage } from "metabase/forms/utils/messages";
import { createMockDashboard } from "metabase-types/api/mocks";

import { setup } from "./tests/setup";

const TEST_DASHBOARD = createMockDashboard({
  id: 1,
  name: "Test Dashboard",
  can_write: true,
});

describe("DashboardHeaderView", () => {
  it("should show a validation error when the name exceeds the max length", async () => {
    await setup({
      dashboard: TEST_DASHBOARD,
    });

    const nameInput = await screen.findByPlaceholderText("Add title");

    // Add name with max length + 1
    await userEvent.click(nameInput);
    const longName = "A".repeat(DASHBOARD_NAME_MAX_LENGTH + 1);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, longName);

    // Blur the input to trigger validation/save attempt
    await userEvent.tab();

    // Check for the error message
    const expectedError = maxLengthErrorMessage({
      max: DASHBOARD_NAME_MAX_LENGTH,
    });
    await waitFor(() => {
      expect(screen.getByText(expectedError)).toBeInTheDocument();
    });
  });
});
