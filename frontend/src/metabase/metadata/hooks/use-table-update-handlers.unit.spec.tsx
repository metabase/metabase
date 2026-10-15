import fetchMock from "fetch-mock";

import { setupTableEndpoints } from "__support__/server-mocks";
import {
  renderHookWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  createOrdersIdField,
  createOrdersQuantityField,
  createOrdersTable,
} from "metabase-types/api/mocks/presets";

import { useTableUpdateHandlers } from "./use-table-update-handlers";

const ORDERS_TABLE = createOrdersTable({
  fields: [createOrdersIdField(), createOrdersQuantityField()],
});

/**
 * The sortable field list drives this handler through a dnd-kit PointerSensor,
 * which jsdom cannot simulate, so the handler is exercised directly.
 */
function setup() {
  setupTableEndpoints(ORDERS_TABLE);

  const { result } = renderHookWithProviders(
    () => useTableUpdateHandlers({ table: ORDERS_TABLE }),
    { withUndos: true },
  );

  return result;
}

describe("useTableUpdateHandlers", () => {
  it("shows an error toast when a custom field order fails to save", async () => {
    const result = setup();

    fetchMock.modifyRoute(`table-${ORDERS_TABLE.id}-fields-order`, {
      response: { status: 500 },
    });

    await result.current.handleCustomFieldOrderChange(
      (ORDERS_TABLE.fields ?? []).map(getRawTableFieldId).reverse(),
    );

    await waitFor(() => {
      expect(
        within(screen.getByTestId("undo-list")).getByText(
          "Failed to update field order",
        ),
      ).toBeInTheDocument();
    });
  });
});
