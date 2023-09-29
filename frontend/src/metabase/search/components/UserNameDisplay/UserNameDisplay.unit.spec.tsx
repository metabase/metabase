import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockUserListResult } from "metabase-types/api/mocks";
import { setupUsersEndpoints } from "__support__/server-mocks";
import type { UserListResult } from "metabase-types/api";
import { UserNameDisplay } from "./UserNameDisplay";
import type { UserNameDisplayProps } from "./UserNameDisplay";

const TEST_USER_LIST_RESULT = createMockUserListResult();

const setup = async ({
  value = null,
  users = [TEST_USER_LIST_RESULT],
  waitForLoading = true,
}: {
  value?: UserNameDisplayProps["value"];
  users?: UserListResult[];
  waitForLoading?: boolean;
} = {}) => {
  setupUsersEndpoints(users);

  renderWithProviders(
    <UserNameDisplay title={"UserNameDisplay Test"} value={value} />,
  );

  if (waitForLoading) {
    await waitFor(() => {
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    });
  }
};

describe("UserNameDisplay", () => {
  it("should initially display loading message when a user is selected", async () => {
    await setup({ waitForLoading: false, value: TEST_USER_LIST_RESULT.id });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("should initially display title when value is null", async () => {
    await setup({ waitForLoading: true });
    expect(screen.getByText("UserNameDisplay Test")).toBeInTheDocument();
  });

  it("should display user name when value is a valid user", async () => {
    await setup({ value: TEST_USER_LIST_RESULT.id });
    expect(screen.getByText("Testy Tableton")).toBeInTheDocument();
  });

  it("should fallback to '1 user selected' if the user doesn't have a common name", async () => {
    // the backend should always return a `common_name` field, so this is a fallback

    const userWithoutCommonName = createMockUserListResult({
      id: 99999,
      common_name: undefined,
    });

    await setup({
      users: [userWithoutCommonName],
      value: userWithoutCommonName.id,
    });
    expect(screen.getByText("1 user selected")).toBeInTheDocument();
  });
});
