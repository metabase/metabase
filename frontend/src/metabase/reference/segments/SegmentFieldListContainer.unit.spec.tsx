import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupSegmentsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockDatabase,
  createMockField,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";

import SegmentFieldListContainer from "./SegmentFieldListContainer";

const TOTAL = createMockField({
  id: 100,
  name: "TOTAL",
  display_name: "Total",
});

const TABLE = createMockTable({ id: 10, db_id: 1, fields: [TOTAL] });

const DATABASE = createMockDatabase({ id: 1, tables: [TABLE] });

const SEGMENT = createMockSegment({
  id: 1,
  name: "Orders < 100",
  table_id: TABLE.id,
});

function setup() {
  setupSegmentsEndpoints([SEGMENT]);
  // Also registers the table endpoints for `DATABASE.tables`.
  setupDatabaseEndpoints(DATABASE);
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);

  return renderWithProviders(
    <Route
      path="/reference/segments/:segmentId/fields"
      element={<SegmentFieldListContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/segments/${SEGMENT.id}/fields`,
    },
  );
}

describe("SegmentFieldListContainer", () => {
  // `SegmentFieldList` reads `table.db_id` while rendering each row, so it
  // throws and blanks the page if the container stops passing `table` down.
  it("renders the segment's fields", async () => {
    setup();

    expect(
      await screen.findAllByText("Fields in Orders < 100"),
    ).not.toHaveLength(0);
    expect(await screen.findByText("Total")).toBeInTheDocument();
  });
});
