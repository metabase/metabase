import { setupUsersEndpoints } from "__support__/server-mocks/user";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { createMockUserInfo } from "metabase-types/api/mocks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";

import { useUserListQuery } from "./use-user-list-query";

const TEST_USER = createMockUserInfo();

function TestComponent() {
  const { data = [], isLoading, error } = useUserListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(user => (
        <div key={user.id}>{user.common_name}</div>
      ))}
    </div>
  );
}

function setup() {
  setupUsersEndpoints([TEST_USER]);
  renderWithProviders(<TestComponent />);
}

describe("useUserListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText("Testy Tableton")).toBeInTheDocument();
  });
});
