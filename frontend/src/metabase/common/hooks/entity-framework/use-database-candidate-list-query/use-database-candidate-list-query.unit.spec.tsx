import { setupDatabaseCandidatesEndpoint } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockDatabaseCandidate } from "metabase-types/api/mocks";

import { useDatabaseCandidateListQuery } from "./use-database-candidate-list-query";

const TEST_DB_ID = 1;
const TEST_DB_CANDIDATE = createMockDatabaseCandidate();

const TestComponent = () => {
  const {
    data = [],
    isLoading,
    error,
  } = useDatabaseCandidateListQuery({
    query: { id: TEST_DB_ID },
  });

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map((item, index) => (
        <div key={index}>{item.schema}</div>
      ))}
    </div>
  );
};

const setup = () => {
  setupDatabaseCandidatesEndpoint(TEST_DB_ID, [TEST_DB_CANDIDATE]);
  renderWithProviders(<TestComponent />);
};

describe("useDatabaseCandidateListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText(TEST_DB_CANDIDATE.schema)).toBeInTheDocument();
  });
});
