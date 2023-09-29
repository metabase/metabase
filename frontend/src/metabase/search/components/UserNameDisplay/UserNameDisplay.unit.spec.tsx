import { screen, waitFor, renderWithProviders } from "__support__/ui";
import { setupUsersEndpoints } from "__support__/server-mocks";
import { createMockUser } from "metabase-types/api/mocks";
import type { User } from "metabase-types/api";
import type { CreatedByFilterProps } from "metabase/search/types";
import { UserNameDisplay } from "./UserNameDisplay";

const TEST_USERS = [
  createMockUser({ id: 1, common_name: "Alice" }),
  createMockUser({ id: 2, common_name: "Bob" }),
];

type SetupProps = {
  users?: User[];
  value?: CreatedByFilterProps | null;
};

const setup = async ({ users = TEST_USERS, value = null }: SetupProps = {}) => {
  setupUsersEndpoints(users);
  renderWithProviders(<UserNameDisplay value={value} />);
  await waitFor(() => {
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
};

describe("UserNameDisplay", () => {
  it("displays correct user name when data is available", async () => {
    await setup({ users: TEST_USERS, value: 1 });
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("displays default title when no user is selected", async () => {
    await setup({ users: TEST_USERS, value: undefined });
    expect(screen.getByText("Creator")).toBeInTheDocument();
  });
});
