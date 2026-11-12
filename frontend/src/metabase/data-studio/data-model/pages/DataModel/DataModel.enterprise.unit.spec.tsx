import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardDataset,
  setupDatabasesEndpoints,
  setupLibraryEndpoints,
  setupTablesBulkEndpoints,
  setupUserAcknowledgementEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import {
  findToast,
  selectOption,
  typeAndBlur,
  undo,
} from "metabase/metadata/pages/shared/tests/helpers";
import {
  getLastRequestBody,
  getRequestBodies,
  setupDataModelBackend,
} from "metabase/metadata/pages/shared/tests/setup-data-model-backend";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { registerVisualizations } from "metabase/visualizations/register";
import type { FieldId } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
  createMockUserListResult,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  createOrdersIdField,
  createOrdersQuantityField,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DataModel } from "./DataModel";
import type { ParsedRouteParams } from "./types";

registerVisualizations();

const ORDERS_TABLE = createOrdersTable({
  description: "Confirmed Sample Company orders for a product, from a user.",
  field_order: "database",
  fields: [
    createOrdersIdField({ position: 0 }),
    createOrdersQuantityField({
      position: 1,
      description: "Number of products bought.",
    }),
  ],
});

const SAMPLE_DB = createSampleDatabase({ tables: [ORDERS_TABLE] });

interface SetupOpts {
  tab: ParsedRouteParams["tab"];
  fieldId?: FieldId;
}

async function setup({ tab, fieldId }: SetupOpts) {
  const backend = setupDataModelBackend({ tables: [ORDERS_TABLE] });
  setupDatabasesEndpoints([SAMPLE_DB]);
  setupCardDataset();
  setupTablesBulkEndpoints();
  setupUsersEndpoints([createMockUserListResult()]);
  setupUserAcknowledgementEndpoints({
    key: "seen-publish-tables-info",
    value: false,
  });
  setupLibraryEndpoints();

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ advanced_permissions: true }),
  });
  setupEnterpriseOnlyPlugin("feature_level_permissions");

  const params: ParsedRouteParams = {
    databaseId: SAMPLE_DB.id,
    schemaName: ORDERS_TABLE.schema,
    tableId: ORDERS_TABLE.id,
    tab,
    fieldId,
  };

  renderWithProviders(
    <Route path="data-studio/data">
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/:tab"
        element={<DataModel />}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/:tab/:fieldId"
        element={<DataModel />}
      />
    </Route>,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: Urls.dataStudioData(params),
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings,
      }),
    },
  );

  await waitForLoaderToBeRemoved();
  expect(await screen.findByTestId("table-section")).toBeInTheDocument();

  return { backend };
}

describe("DataModel > undo (advanced permissions)", () => {
  beforeEach(() => {
    // so the virtual list renders correctly in the tests
    mockGetBoundingClientRect();
    jest.spyOn(Analytics, "trackSimpleEvent");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should undo the changes of the table section", async () => {
    const { backend } = await setup({ tab: "details" });
    const tablePutRoute = `stateful-table-${ORDERS_TABLE.id}-put`;
    const fieldPutRoute = `stateful-field-${ORDERS.QUANTITY}-put`;

    await typeAndBlur(await findTableNameInput(), "a");
    await undo("Table name updated");
    expect(getRequestBodies(tablePutRoute)).toEqual([
      { display_name: "Ordersa" },
      { display_name: "Orders" },
    ]);
    await waitFor(async () =>
      expect(await findTableNameInput()).toHaveValue("Orders"),
    );

    await typeAndBlur(getTableDescriptionInput(), "a");
    await undo("Table description updated");
    expect(getLastRequestBody(tablePutRoute)).toEqual({
      description: ORDERS_TABLE.description,
    });
    await waitFor(() =>
      expect(getTableDescriptionInput()).toHaveValue(ORDERS_TABLE.description),
    );

    await userEvent.click(screen.getByRole("tab", { name: "Fields" }));
    await userEvent.click(
      await within(getTableSection()).findByRole("button", {
        name: /Sorting/,
      }),
    );
    await userEvent.click(
      within(getSortOrderInput()).getByLabelText("Alphabetical order"),
    );
    await undo("Field order updated");
    expect(getRequestBodies(tablePutRoute).slice(-2)).toEqual([
      { field_order: "alphabetical" },
      { field_order: "database" },
    ]);
    await waitFor(() =>
      expect(
        within(getSortOrderInput()).getByDisplayValue("database"),
      ).toBeChecked(),
    );
    expect(backend.getTable(ORDERS_TABLE.id).field_order).toBe("database");
    await userEvent.click(
      within(getTableSection()).getByRole("button", { name: /Done/ }),
    );

    await typeAndBlur(getTableSectionFieldNameInput("Quantity"), "a");
    await undo("Name of Quantity updated");
    expect(getRequestBodies(fieldPutRoute)).toEqual([
      { display_name: "Quantitya" },
      { display_name: "Quantity" },
    ]);
    await waitFor(() =>
      expect(getTableSectionFieldNameInput("Quantity")).toHaveValue("Quantity"),
    );

    await typeAndBlur(getTableSectionFieldDescriptionInput("Quantity"), "a");
    await undo("Description of Quantity updated");
    expect(getLastRequestBody(fieldPutRoute)).toEqual({
      description: "Number of products bought.",
    });
    await waitFor(() =>
      expect(getTableSectionFieldDescriptionInput("Quantity")).toHaveValue(
        "Number of products bought.",
      ),
    );
  });

  it("should undo a change of the field section", async () => {
    await setup({ tab: "field", fieldId: ORDERS.QUANTITY });
    const putRoute = `stateful-field-${ORDERS.QUANTITY}-put`;

    await selectOption(getSemanticTypeInput(), "Score");
    expect(Analytics.trackSimpleEvent).toHaveBeenCalledWith({
      event: "metadata_edited",
      event_detail: "semantic_type_change",
      triggered_from: "data_studio",
    });
    await undo("Semantic type of Quantity updated");
    expect(getRequestBodies(putRoute)).toEqual([
      { semantic_type: "type/Score" },
      { semantic_type: "type/Quantity", fk_target_field_id: null },
    ]);
    await waitFor(() => expect(getSemanticTypeInput()).toHaveValue("Quantity"));
  });

  it("should save the number style of a field", async () => {
    await setup({ tab: "field", fieldId: ORDERS.QUANTITY });

    await userEvent.click(
      within(
        screen.getByTestId("chart-settings-widget-number_style"),
      ).getByText("123%"),
    );

    await findToast("Formatting of Quantity updated");
    expect(getLastRequestBody(`stateful-field-${ORDERS.QUANTITY}-put`)).toEqual(
      { settings: { number_style: "percent" } },
    );
    expect(Analytics.trackSimpleEvent).toHaveBeenCalledWith({
      event: "metadata_edited",
      event_detail: "formatting",
      triggered_from: "data_studio",
    });

    // the feature_level_permissions plugin asks for the editable data model
    const metadataParams = fetchMock.callHistory
      .calls(`stateful-table-${ORDERS_TABLE.id}-query-metadata`)
      .map((call) => new URL(call.url).searchParams);
    expect(metadataParams.length).toBeGreaterThan(0);
    metadataParams.forEach((params) => {
      expect(params.get("include_editable_data_model")).toBe("true");
    });
  });
});

function getTableSection() {
  return screen.getByTestId("table-section");
}

async function findTableNameInput() {
  return within(getTableSection()).findByPlaceholderText(
    "Give this table a name",
  );
}

function getTableDescriptionInput() {
  return within(getTableSection()).getByPlaceholderText(
    "Give this table a description",
  );
}

function getSortOrderInput() {
  return within(getTableSection()).getByRole("radiogroup", {
    name: "Column order",
  });
}

/** ByRole skips the sortable list, which stays mounted and aria-hidden */
function getTableSectionField(name: string) {
  return within(getTableSection()).getByRole("listitem", { name });
}

function getTableSectionFieldNameInput(name: string) {
  return within(getTableSectionField(name)).getByPlaceholderText(
    "Give this field a name",
  );
}

function getTableSectionFieldDescriptionInput(name: string) {
  return within(getTableSectionField(name)).getByPlaceholderText(
    "No description yet",
  );
}

function getSemanticTypeInput() {
  return within(screen.getByTestId("field-section")).getByPlaceholderText(
    "Select a semantic type",
  );
}
