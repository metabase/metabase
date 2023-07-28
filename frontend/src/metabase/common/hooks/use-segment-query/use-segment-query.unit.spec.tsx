import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockSegment } from "metabase-types/api/mocks";
import { setupSegmentsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { useSegmentQuery } from "./use-segment-query";

const TEST_SEGMENT = createMockSegment();

const TestComponent = () => {
  const { data, isLoading, error } = useSegmentQuery({
    id: TEST_SEGMENT.id,
  });

  if (isLoading || error || !data) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <div>{data.name}</div>;
};

const setup = () => {
  setupSegmentsEndpoints([TEST_SEGMENT]);
  renderWithProviders(<TestComponent />);
};

describe("useSegmentQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(TEST_SEGMENT.name)).toBeInTheDocument();
  });
});
