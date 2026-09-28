import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupTableEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { FieldId, Table } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import {
  createOrdersQuantityField,
  createOrdersTable,
} from "metabase-types/api/mocks/presets";

import { TableSection } from "./TableSection";

/**
 * The sortable field list reorders through a dnd-kit PointerSensor, which
 * jsdom cannot simulate, so it is replaced with a button that emits a new order.
 */
jest.mock("../TableSortableFieldList", () => ({
  TableSortableFieldList: ({
    table,
    onChange,
  }: {
    table: Table;
    onChange: (fieldOrder: FieldId[]) => void;
  }) => (
    <button
      onClick={() =>
        onChange(
          (table.fields ?? []).map((field) => Number(field.id)).reverse(),
        )
      }
    >
      Reorder fields
    </button>
  ),
}));

const ORDERS_TABLE = createOrdersTable({
  fields: [createOrdersQuantityField()],
});

type SetupOpts = {
  table?: Table;
  fieldId?: FieldId;
};

function setup({ table = createMockTable(), fieldId }: SetupOpts = {}) {
  const onSyncOptionsClick = jest.fn();

  setupTableEndpoints(table);

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <>
          <TableSection
            table={table}
            fieldId={fieldId}
            withName
            getFieldHref={(fieldId) => `/field/${fieldId}`}
            onSyncOptionsClick={onSyncOptionsClick}
          />
          <UndoListing />
        </>
      )}
    />,
    { withRouter: true },
  );

  return { onSyncOptionsClick };
}

async function assertErrorToast(message: string) {
  await waitFor(() => {
    expect(
      within(screen.getByTestId("undo-list")).getByText(message),
    ).toBeInTheDocument();
  });
}

describe("TableSection", () => {
  it("should render the link to explore this table in the query builder", () => {
    const table = createMockTable();
    setup({ table });

    const tableLink = screen.getByLabelText("Go to this table");
    expect(tableLink).toBeInTheDocument();
    expect(tableLink).toHaveAttribute(
      "href",
      `/question#?db=${table.db_id}&table=${table.id}`,
    );
  });

  it("should not render the sync options button when the database is hosted", () => {
    const database = createMockDatabase({ is_attached_dwh: true });
    const table = createMockTable({ db: database });
    setup({ table });
    expect(screen.queryByText("Sync options")).not.toBeInTheDocument();
  });

  describe("error handling", () => {
    it("shows an error toast when updating the table name fails", async () => {
      setup({ table: ORDERS_TABLE });
      fetchMock.modifyRoute(`table-${ORDERS_TABLE.id}-put`, {
        response: { status: 500 },
      });

      await userEvent.type(
        screen.getByPlaceholderText("Give this table a name"),
        "a",
      );
      await userEvent.tab();

      await assertErrorToast("Failed to update table name");
    });

    it("shows an error toast when updating the table description fails", async () => {
      setup({ table: ORDERS_TABLE });
      fetchMock.modifyRoute(`table-${ORDERS_TABLE.id}-put`, {
        response: { status: 500 },
      });

      await userEvent.type(
        screen.getByPlaceholderText("Give this table a description"),
        "a",
      );
      await userEvent.tab();

      await assertErrorToast("Failed to update table description");
    });

    it("shows an error toast when updating the field order fails", async () => {
      setup({ table: ORDERS_TABLE });
      fetchMock.modifyRoute(`table-${ORDERS_TABLE.id}-put`, {
        response: { status: 500 },
      });

      await userEvent.click(screen.getByRole("button", { name: /Sorting/ }));
      await userEvent.click(screen.getByLabelText("Alphabetical order"));

      await assertErrorToast("Failed to update field order");
    });

    it("shows an error toast when a custom field order fails to save", async () => {
      setup({ table: ORDERS_TABLE });
      fetchMock.modifyRoute(`table-${ORDERS_TABLE.id}-fields-order`, {
        response: { status: 500 },
      });

      await userEvent.click(screen.getByRole("button", { name: /Sorting/ }));
      await userEvent.click(screen.getByText("Reorder fields"));

      await assertErrorToast("Failed to update field order");
    });
  });
});
