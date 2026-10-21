import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupSegmentsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import type { Database, Segment } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockSegment,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

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

interface SetupOpts {
  database?: Database;
  segment?: Segment;
}

function setup({ database = DATABASE, segment = SEGMENT }: SetupOpts = {}) {
  setupSegmentsEndpoints([segment]);
  // Also registers the table endpoints for `database.tables`.
  setupDatabaseEndpoints(database);
  fetchMock.get(`path:/api/database/${database.id}/metadata`, database);

  return renderWithProviders(
    <Route
      path="/reference/segments/:segmentId/fields"
      element={<SegmentFieldListContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/segments/${segment.id}/fields`,
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
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

  it("should allow changing the FK target and the semantic type of a field (metabase#55617, metabase#55618)", async () => {
    setup({
      database: createSampleDatabase(),
      segment: createMockSegment({
        id: 2,
        name: "My segment",
        table_id: ORDERS_ID,
      }),
    });

    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));

    expect(screen.getAllByPlaceholderText("Select a target")).toHaveLength(2);
    expect(screen.getByDisplayValue("Products → ID")).toBeInTheDocument();
    const userIdTargetInput = screen.getByDisplayValue("People → ID");

    await userEvent.click(userIdTargetInput);
    const fkTargetList = await screen.findByRole("listbox");
    expect(within(fkTargetList).getByText("Orders → ID")).toBeInTheDocument();
    expect(within(fkTargetList).getByText("People → ID")).toBeInTheDocument();
    expect(within(fkTargetList).getByText("Products → ID")).toBeInTheDocument();
    await userEvent.click(within(fkTargetList).getByText("Reviews → ID"));
    expect(userIdTargetInput).toHaveValue("Reviews → ID");

    const discountSemanticTypeInput = checkNotNull(
      screen
        .getAllByPlaceholderText("Select a semantic type")
        .find(
          (input) =>
            input instanceof HTMLInputElement && input.value === "Discount",
        ),
    );
    await userEvent.click(discountSemanticTypeInput);
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText("No semantic type"),
    );
    expect(discountSemanticTypeInput).toHaveValue("No semantic type");
  });
});
