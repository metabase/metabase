import { setupUserRecipientsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { UserListResult } from "metabase-types/api";
import { createMockUserListResult } from "metabase-types/api/mocks";

import type { UserNameDisplayProps } from "./UserNameDisplay";
import { UserNameDisplay } from "./UserNameDisplay";

const TEST_USER_LIST_RESULTS = [
  createMockUserListResult({ id: 1, common_name: "Testy Tableton" }),
  createMockUserListResult({ id: 2, common_name: "Testy McTestface" }),
];

const setup = async ({
  userIdList = [],
  users = TEST_USER_LIST_RESULTS,
  waitForLoading = true,
}: {
  userIdList?: UserNameDisplayProps["userIdList"];
  users?: UserListResult[];
  waitForLoading?: boolean;
} = {}) => {
  setupUserRecipientsEndpoint({ users });

  renderWithProviders(
    <UserNameDisplay label={"UserNameDisplay Test"} userIdList={userIdList} />,
  );

  if (waitForLoading) {
    await waitFor(() => {
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    });
  }
};

describe("UserNameDisplay", () => {
  it("should initially display loading message when users are selected", async () => {
    await setup({
      waitForLoading: false,
      userIdList: [TEST_USER_LIST_RESULTS[0].id],
    });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("should initially display title when user list is empty", async () => {
    await setup({ waitForLoading: true });
    expect(screen.getByText("UserNameDisplay Test")).toBeInTheDocument();
  });

  it("should display user name when there's one user in the list", async () => {
    await setup({ userIdList: [TEST_USER_LIST_RESULTS[0].id] });
    expect(screen.getByText("Testy Tableton")).toBeInTheDocument();
  });

  it("should fallback to '1 user selected' if there is one user and they don't have a common name", async () => {
    // the backend should always return a `common_name` field, so this is a fallback

    const userWithoutCommonName = createMockUserListResult({
      id: 99999,
      common_name: undefined,
    });

    await setup({
      users: [userWithoutCommonName],
      userIdList: [userWithoutCommonName.id],
    });
    expect(screen.getByText("1 user selected")).toBeInTheDocument();
  });

  it("should display `X users selected` if there are multiple users", async () => {
    await setup({
      userIdList: TEST_USER_LIST_RESULTS.map(user => user.id),
    });
    expect(
      screen.getByText(`${TEST_USER_LIST_RESULTS.length} users selected`),
    ).toBeInTheDocument();
  });
});
