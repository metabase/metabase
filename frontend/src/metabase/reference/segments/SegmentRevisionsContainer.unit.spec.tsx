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

import SegmentRevisionsContainer from "./SegmentRevisionsContainer";

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
  fetchMock.get(`path:/api/revision?entity=segment&id=${SEGMENT.id}`, []);
  fetchMock.get("path:/api/revision", []);

  return renderWithProviders(
    <Route
      path="/reference/segments/:segmentId/revisions"
      element={<SegmentRevisionsContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/segments/${SEGMENT.id}/revisions`,
    },
  );
}

describe("SegmentRevisionsContainer", () => {
  it("renders the revision history for the segment named by the route param", async () => {
    setup();

    expect(
      await screen.findAllByText("Revision history for Orders < 100"),
    ).not.toHaveLength(0);
  });
});
