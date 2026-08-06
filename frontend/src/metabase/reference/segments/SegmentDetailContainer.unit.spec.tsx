import {
  setupSegmentsEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockSegment, createMockTable } from "metabase-types/api/mocks";

import SegmentDetailContainer from "./SegmentDetailContainer";

const TABLE = createMockTable({ id: 10, db_id: 1 });

const SEGMENT = createMockSegment({
  id: 1,
  name: "Active subscribers",
  table_id: TABLE.id,
});

const OTHER_SEGMENT = createMockSegment({
  id: 2,
  name: "Churned accounts",
  table_id: TABLE.id,
});

function setup({ segmentId = SEGMENT.id } = {}) {
  setupSegmentsEndpoints([SEGMENT, OTHER_SEGMENT]);
  setupTableEndpoints(TABLE);

  return renderWithProviders(
    <Route
      path="/reference/segments/:segmentId"
      element={<SegmentDetailContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/segments/${segmentId}`,
    },
  );
}

describe("SegmentDetailContainer", () => {
  it("shows the segment named by the route param", async () => {
    setup();

    expect(await screen.findAllByText("Active subscribers")).not.toHaveLength(
      0,
    );
  });

  it("selects the segment by id, so a different param shows a different segment", async () => {
    setup({ segmentId: OTHER_SEGMENT.id });

    expect(await screen.findAllByText("Churned accounts")).not.toHaveLength(0);
    expect(screen.queryByText("Active subscribers")).not.toBeInTheDocument();
  });
});
