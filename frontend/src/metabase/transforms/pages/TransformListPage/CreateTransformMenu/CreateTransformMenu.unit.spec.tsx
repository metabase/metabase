import userEvent from "@testing-library/user-event";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";

import { CreateTransformMenu } from "./CreateTransformMenu";

describe("CreateTransformMenu", () => {
  it("shows the SQL query item", async () => {
    setupDatabasesEndpoints([createMockDatabase()]);
    renderWithProviders(<CreateTransformMenu />, { withRouter: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Create a transform" }),
    );

    expect(await screen.findByText("SQL query")).toBeInTheDocument();
  });
});
