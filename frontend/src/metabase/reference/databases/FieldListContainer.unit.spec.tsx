import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupDatabaseMetadataEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  renderRoutes,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getReferenceRoutes } from "../routes";

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

function setup() {
  setupDatabaseEndpoints(DATABASE);
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);

  return renderWithProviders(
    <Route
      path="/reference/databases/:databaseId/tables/:tableId/fields"
      element={<FieldListContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/databases/${DATABASE.id}/tables/${TABLE.id}/fields`,
    },
  );
}

describe("FieldListContainer", () => {
  it("lists the fields of the table named by the route params", async () => {
    setup();

    expect(await screen.findAllByText("Fields in Orders")).not.toHaveLength(0);
    expect(await screen.findByText("Total")).toBeInTheDocument();
  });
});

describe("reference table field pages", () => {
  const SAMPLE_DATABASE = createSampleDatabase();

  function setupRoutes() {
    // Registers `/api/database/:id/idfields` for this database id only.
    setupDatabaseEndpoints(SAMPLE_DATABASE);
    setupDatabaseMetadataEndpoint(SAMPLE_DATABASE);

    renderRoutes(getReferenceRoutes(), {
      initialRoute: `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields`,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    });
  }

  // A row of the field list, found by the column name its display name input
  // uses as a placeholder.
  function getFieldRow(columnName: string) {
    const row = screen
      .getAllByRole("listitem")
      .find((item) => within(item).queryByPlaceholderText(columnName));
    if (row == null) {
      throw new Error(`No row for ${columnName}`);
    }
    return row;
  }

  function getIdFieldsRequestUrls() {
    return fetchMock.callHistory
      .calls()
      .map((call) => call.url)
      .filter((url) => url.includes("/idfields"));
  }

  async function expectFkTargetOptions() {
    const listbox = await screen.findByRole("listbox");
    for (const option of [
      "Orders → ID",
      "People → ID",
      "Products → ID",
      "Reviews → ID",
    ]) {
      expect(within(listbox).getByText(option)).toBeVisible();
    }
    return listbox;
  }

  async function chooseNoSemanticType(input: HTMLElement) {
    await userEvent.click(input);
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText("No semantic type"),
    );
  }

  it("changes the FK target and the semantic type of fields in the list and the detail view (metabase#55617, metabase#55618)", async () => {
    setupRoutes();

    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));

    // metabase#55618
    const targetInputs =
      await screen.findAllByPlaceholderText("Select a target");
    expect(targetInputs).toHaveLength(2);
    expect(targetInputs[0]).toHaveValue("People → ID");
    expect(targetInputs[1]).toHaveValue("Products → ID");
    expect(
      within(getFieldRow("USER_ID")).getByPlaceholderText("Select a target"),
    ).toBe(targetInputs[0]);
    expect(getIdFieldsRequestUrls()).not.toHaveLength(0);
    for (const url of getIdFieldsRequestUrls()) {
      expect(new URL(url).pathname).toBe(
        `/api/database/${SAMPLE_DB_ID}/idfields`,
      );
    }

    await userEvent.click(targetInputs[0]);
    const listbox = await expectFkTargetOptions();
    await userEvent.click(within(listbox).getByText("Reviews → ID"));

    await waitFor(() =>
      expect(
        within(getFieldRow("USER_ID")).getByPlaceholderText("Select a target"),
      ).toHaveValue("Reviews → ID"),
    );
    expect(
      within(getFieldRow("PRODUCT_ID")).getByPlaceholderText("Select a target"),
    ).toHaveValue("Products → ID");

    // metabase#55617
    const discountRow = getFieldRow("DISCOUNT");
    // The 7th field of the table, as in the Orders table of the sample db.
    expect(screen.getAllByPlaceholderText("Select a semantic type")[6]).toBe(
      within(discountRow).getByPlaceholderText("Select a semantic type"),
    );
    const discountType = within(discountRow).getByPlaceholderText(
      "Select a semantic type",
    );
    expect(discountType).toHaveValue("Discount");
    await chooseNoSemanticType(discountType);
    await waitFor(() =>
      expect(
        within(getFieldRow("DISCOUNT")).getByPlaceholderText(
          "Select a semantic type",
        ),
      ).toHaveValue("No semantic type"),
    );

    // field detail view
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(await screen.findByRole("link", { name: /User ID/ }));

    // metabase#55618
    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    const targetInput = await screen.findByPlaceholderText("Select a target");
    expect(targetInput).toHaveValue("People → ID");
    await userEvent.click(targetInput);
    const detailListbox = await expectFkTargetOptions();
    await userEvent.click(within(detailListbox).getByText("Reviews → ID"));
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Select a target")).toHaveValue(
        "Reviews → ID",
      ),
    );

    // metabase#55617
    const fieldType = screen.getByPlaceholderText("Select a semantic type");
    expect(fieldType).toHaveValue("Foreign Key");
    await chooseNoSemanticType(fieldType);
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Select a semantic type")).toHaveValue(
        "No semantic type",
      ),
    );
  });
});
