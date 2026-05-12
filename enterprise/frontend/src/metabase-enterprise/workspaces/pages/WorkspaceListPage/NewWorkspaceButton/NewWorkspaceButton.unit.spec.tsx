import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";

import { NewWorkspaceButton } from "./NewWorkspaceButton";

const POSTGRES = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["workspace"],
});

function setup() {
  renderWithProviders(<NewWorkspaceButton availableDatabases={[POSTGRES]} />, {
    withRouter: true,
  });
}

describe("NewWorkspaceButton", () => {
  it("opens the New workspace modal when clicked", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Add workspace/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "New workspace" }),
    ).toBeInTheDocument();
  });
});
