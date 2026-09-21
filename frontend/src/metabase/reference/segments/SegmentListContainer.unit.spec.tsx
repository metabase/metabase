import { setupSegmentsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockSegment } from "metabase-types/api/mocks";

import SegmentListContainer from "./SegmentListContainer";

const SEGMENT = createMockSegment({ id: 1, name: "Active subscribers" });

function setup() {
  setupSegmentsEndpoints([SEGMENT]);

  return renderWithProviders(
    <Route path="/reference/segments" element={<SegmentListContainer />} />,
    { withRouter: true, initialRoute: "/reference/segments" },
  );
}

describe("SegmentListContainer", () => {
  it("fetches segments on mount and lists them", async () => {
    setup();

    expect(await screen.findByText("Active subscribers")).toBeInTheDocument();
  });
});
