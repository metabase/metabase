import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { Database, TableId } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import FieldListContainer from "./FieldListContainer";

const TOTAL = createMockField({
  id: 100,
  name: "TOTAL",
  display_name: "Total",
  table_id: 10,
});

const TABLE = createMockTable({
  id: 10,
  db_id: 1,
  display_name: "Orders",
  fields: [TOTAL],
});

const DATABASE = createMockDatabase({ id: 1, tables: [TABLE] });

interface SetupOpts {
  database?: Database;
  tableId?: TableId;
}

function setup({ database = DATABASE, tableId = TABLE.id }: SetupOpts = {}) {
  setupDatabaseEndpoints(database);
  fetchMock.get(`path:/api/database/${database.id}/metadata`, database);

  return renderWithProviders(
    <Route
      path="/reference/databases/:databaseId/tables/:tableId/fields"
      element={<FieldListContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/databases/${database.id}/tables/${tableId}/fields`,
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );
}

describe("FieldListContainer", () => {
  it("lists the fields of the table named by the route params", async () => {
    setup();

    expect(await screen.findAllByText("Fields in Orders")).not.toHaveLength(0);
    expect(await screen.findByText("Total")).toBeInTheDocument();
  });

  it("should allow changing the FK target and the semantic type of a field (metabase#55617, metabase#55618)", async () => {
    setup({ database: createSampleDatabase(), tableId: ORDERS_ID });

    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));

    const fkTargetInputs = screen.getAllByPlaceholderText("Select a target");
    expect(fkTargetInputs).toHaveLength(2);
    expect(fkTargetInputs[0]).toHaveValue("People → ID");
    expect(fkTargetInputs[1]).toHaveValue("Products → ID");

    await userEvent.click(fkTargetInputs[0]);
    const fkTargetList = await screen.findByRole("listbox");
    expect(within(fkTargetList).getByText("Orders → ID")).toBeInTheDocument();
    expect(within(fkTargetList).getByText("People → ID")).toBeInTheDocument();
    expect(within(fkTargetList).getByText("Products → ID")).toBeInTheDocument();
    await userEvent.click(within(fkTargetList).getByText("Reviews → ID"));
    expect(screen.getAllByPlaceholderText("Select a target")[0]).toHaveValue(
      "Reviews → ID",
    );

    const discountSemanticTypeInput = screen.getAllByPlaceholderText(
      "Select a semantic type",
    )[6];
    expect(discountSemanticTypeInput).toHaveValue("Discount");
    await userEvent.click(discountSemanticTypeInput);
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText("No semantic type"),
    );
    expect(
      screen.getAllByPlaceholderText("Select a semantic type")[6],
    ).toHaveValue("No semantic type");
  });
});
