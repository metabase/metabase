import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupSegmentsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { Database, Field, Segment } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockSegment,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

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

interface SetupOpts {
  database?: Database;
  segment?: Segment;
  fieldId?: Field["id"];
}

function setup({
  database = DATABASE,
  segment = SEGMENT,
  fieldId = TOTAL.id,
}: SetupOpts = {}) {
  setupSegmentsEndpoints([segment]);
  setupDatabaseEndpoints(database);
  fetchMock.get(`path:/api/database/${database.id}/metadata`, database);

  return renderWithProviders(
    <Route
      path="/reference/segments/:segmentId/fields/:fieldId"
      element={<SegmentFieldDetailContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/segments/${segment.id}/fields/${fieldId}`,
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
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

  it("should allow changing the FK target and the semantic type of a field (metabase#55617, metabase#55618)", async () => {
    setup({
      database: createSampleDatabase(),
      segment: createMockSegment({
        id: 2,
        name: "My segment",
        table_id: ORDERS_ID,
      }),
      fieldId: ORDERS.USER_ID,
    });

    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));

    const fkTargetInput = screen.getByPlaceholderText("Select a target");
    expect(fkTargetInput).toHaveValue("People → ID");
    await userEvent.click(fkTargetInput);
    const fkTargetList = await screen.findByRole("listbox");
    expect(within(fkTargetList).getByText("Orders → ID")).toBeInTheDocument();
    expect(within(fkTargetList).getByText("People → ID")).toBeInTheDocument();
    expect(within(fkTargetList).getByText("Products → ID")).toBeInTheDocument();
    await userEvent.click(within(fkTargetList).getByText("Reviews → ID"));
    expect(screen.getByPlaceholderText("Select a target")).toHaveValue(
      "Reviews → ID",
    );

    const semanticTypeInput = screen.getByPlaceholderText(
      "Select a semantic type",
    );
    expect(semanticTypeInput).toHaveValue("Foreign Key");
    await userEvent.click(semanticTypeInput);
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText("No semantic type"),
    );
    expect(screen.getByPlaceholderText("Select a semantic type")).toHaveValue(
      "No semantic type",
    );
  });
});
