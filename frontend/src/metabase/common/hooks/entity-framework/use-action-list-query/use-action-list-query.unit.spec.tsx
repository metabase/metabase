import { setupActionsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockImplicitQueryAction } from "metabase-types/api/mocks";

import { useActionListQuery } from "./use-action-list-query";

const IMPLICIT_ACTION = createMockImplicitQueryAction();

const TestComponent = () => {
  const { data = [], isLoading, error } = useActionListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(action => (
        <div key={action.id}>{action.name}</div>
      ))}
    </div>
  );
};

const setup = () => {
  setupActionsEndpoints([IMPLICIT_ACTION]);
  renderWithProviders(<TestComponent />);
};

describe("useActionListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText(IMPLICIT_ACTION.name)).toBeInTheDocument();
  });
});
