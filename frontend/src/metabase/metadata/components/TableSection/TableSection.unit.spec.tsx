import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTableEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { Route } from "metabase/router";
import type { FieldId, Table } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import {
  createOrdersQuantityField,
  createOrdersTable,
} from "metabase-types/api/mocks/presets";

import { TableSection } from "./TableSection";

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
      element={
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
      }
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
  });

  describe("read-only table", () => {
    it("shows a table that cannot be written as read-only", () => {
      setup({ table: { ...ORDERS_TABLE, can_write: false } });

      expect(
        screen.getByPlaceholderText("Give this table a name"),
      ).toHaveAttribute("readonly");
      expect(screen.getByLabelText("table2 icon")).toBeInTheDocument();
      expect(screen.getByLabelText("Go to this table")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Sorting/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Give this field a name"),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /Sync options/ }),
      ).toBeEnabled();
    });

    it("keeps a writable table editable", () => {
      setup({ table: { ...ORDERS_TABLE, can_write: true } });

      expect(
        screen.getByPlaceholderText("Give this table a name"),
      ).not.toHaveAttribute("readonly");
      expect(screen.getByRole("button", { name: /Sorting/ })).toBeEnabled();
      expect(
        screen.getByPlaceholderText("Give this field a name"),
      ).toBeEnabled();
    });
  });
});
