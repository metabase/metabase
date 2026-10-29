import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTableEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import {
  createOrdersQuantityField,
  createOrdersTable,
} from "metabase-types/api/mocks/presets";

import { TableFieldList } from "./TableFieldList";

const QUANTITY_FIELD = createOrdersQuantityField();

const ORDERS_TABLE = createOrdersTable({ fields: [QUANTITY_FIELD] });

function setup() {
  setupTableEndpoints(ORDERS_TABLE);

  renderWithProviders(
    <>
      <TableFieldList
        table={ORDERS_TABLE}
        getFieldHref={(fieldId) => `/field/${fieldId}`}
      />
      <UndoListing />
    </>,
  );

  fetchMock.modifyRoute(`field-${QUANTITY_FIELD.id}-put`, {
    response: { status: 500 },
  });
}

function getField(name: string) {
  return within(screen.getByRole("listitem", { name }));
}

async function assertErrorToast(message: string) {
  await waitFor(() => {
    expect(
      within(screen.getByTestId("undo-list")).getByText(message),
    ).toBeInTheDocument();
  });
}

describe("TableFieldList", () => {
  describe("error handling", () => {
    it("shows an error toast when renaming a field fails", async () => {
      setup();

      await userEvent.type(
        getField("Quantity").getByPlaceholderText("Give this field a name"),
        "a",
      );
      await userEvent.tab();

      await assertErrorToast("Failed to update name of Quantity");
    });

    it("shows an error toast when updating a field description fails", async () => {
      setup();

      await userEvent.type(
        getField("Quantity").getByPlaceholderText("No description yet"),
        "a",
      );
      await userEvent.tab();

      await assertErrorToast("Failed to update description of Quantity");
    });
  });
});
