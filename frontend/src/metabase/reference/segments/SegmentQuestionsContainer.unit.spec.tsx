import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupSegmentsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockDatabase,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";

import SegmentQuestionsContainer from "./SegmentQuestionsContainer";

const TABLE = createMockTable({ id: 10, db_id: 1 });

const DATABASE = createMockDatabase({ id: 1, tables: [TABLE] });

const SEGMENT = createMockSegment({
  id: 1,
  name: "Orders < 100",
  table_id: TABLE.id,
});

function setup() {
  setupSegmentsEndpoints([SEGMENT]);
  setupDatabaseEndpoints(DATABASE);
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);
  fetchMock.get("path:/api/card", []);

  return renderWithProviders(
    <Route
      path="/reference/segments/:segmentId/questions"
      element={<SegmentQuestionsContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/segments/${SEGMENT.id}/questions`,
    },
  );
}

describe("SegmentQuestionsContainer", () => {
  it("renders the questions view for the segment named by the route param", async () => {
    setup();

    expect(
      await screen.findAllByText("Questions about Orders < 100"),
    ).not.toHaveLength(0);
  });
});
