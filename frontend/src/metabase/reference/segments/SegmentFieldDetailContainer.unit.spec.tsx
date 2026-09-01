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

import SegmentFieldDetailContainer from "./SegmentFieldDetailContainer";

const TOTAL = createMockField({
  id: 100,
  name: "TOTAL",
  display_name: "Total",
  table_id: 10,
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
  setupDatabaseEndpoints(DATABASE);
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);

  return renderWithProviders(
    <Route
      path="/reference/segments/:segmentId/fields/:fieldId"
      element={<SegmentFieldDetailContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/segments/${SEGMENT.id}/fields/${TOTAL.id}`,
    },
  );
}

describe("SegmentFieldDetailContainer", () => {
  it("renders the detail view for the field named by the route params", async () => {
    setup();

    expect(await screen.findAllByText("Total")).not.toHaveLength(0);
    expect(
      await screen.findByText("Actual name in database"),
    ).toBeInTheDocument();
  });
});
