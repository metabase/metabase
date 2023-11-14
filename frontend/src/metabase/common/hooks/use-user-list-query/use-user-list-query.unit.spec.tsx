import {
  setupUserRecipientsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { createMockUserInfo } from "metabase-types/api/mocks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";

import { useUserListQuery } from "./use-user-list-query";

const TEST_USER = createMockUserInfo();

type TestComponentProps = { getRecipients?: boolean };

function TestComponent({ getRecipients = false }: TestComponentProps) {
  const {
    data = [],
    metadata,
    isLoading,
    error,
  } = useUserListQuery({
    query: {
      recipients: getRecipients,
    },
  });

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(user => (
        <div key={user.id}>{user.common_name}</div>
      ))}

      <div data-testid="metadata">
        {(!metadata || Object.keys(metadata).length === 0) && "No metadata"}
      </div>
    </div>
  );
}

function setup({ getRecipients = false }: TestComponentProps = {}) {
  const usersEndpoint = setupUsersEndpoints([TEST_USER]);
  const userRecipientsEndpoint = setupUserRecipientsEndpoint({
    users: [TEST_USER],
  });
  renderWithProviders(<TestComponent getRecipients={getRecipients} />);

  return {
    usersEndpoint,
    userRecipientsEndpoint,
  };
}

describe("useUserListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Testy Tableton")).toBeInTheDocument();
  });

  it("should not have any metadata in the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(
      within(screen.getByTestId("metadata")).getByText("No metadata"),
    ).toBeInTheDocument();
  });

  it("should call /api/user when recipient isn't passed or is false", async () => {
    const { usersEndpoint } = setup();

    expect(usersEndpoint).toHaveBeenCalled();
  });

  it("should call /api/user/recipients when the `recipient` is passed", async () => {
    const { userRecipientsEndpoint } = setup({ getRecipients: true });

    expect(userRecipientsEndpoint).toHaveBeenCalled();
  });
});
