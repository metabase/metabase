import { setupActionsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { createMockImplicitQueryAction } from "metabase-types/api/mocks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { useActionQuery } from "./use-action-query";

const IMPLICIT_ACTION = createMockImplicitQueryAction();

const TestComponent = () => {
  const {
    data: action,
    isLoading,
    error,
  } = useActionQuery({ id: IMPLICIT_ACTION.id });

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      <div>{action?.name}</div>
    </div>
  );
};

const setup = () => {
  setupActionsEndpoints([IMPLICIT_ACTION]);
  renderWithProviders(<TestComponent />);
};

describe("useActionQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(IMPLICIT_ACTION.name)).toBeInTheDocument();
  });
});
