import userEvent from "@testing-library/user-event";

import {
  setupGroupsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockUserListResult } from "metabase-types/api/mocks";

import { PrincipalPicker } from "./PrincipalPicker";

describe("PrincipalPicker", () => {
  it("says No results found when the search matches nobody", async () => {
    setup();

    const field = screen.getByRole("textbox", { name: "Who to preview" });
    await userEvent.click(field);
    expect(await screen.findByText("Sandy Sales")).toBeInTheDocument();
    await userEvent.type(field, "nobody by this name");

    expect(await screen.findByText("No results found")).toBeInTheDocument();
    expect(screen.queryByText("Sandy Sales")).not.toBeInTheDocument();
  });
});

function setup() {
  setupUsersEndpoints([
    createMockUserListResult({ id: 2, common_name: "Sandy Sales" }),
  ]);
  setupGroupsEndpoint([]);

  renderWithProviders(
    <PrincipalPicker value={{ type: "user", id: 0 }} onChange={jest.fn()} />,
  );
}
