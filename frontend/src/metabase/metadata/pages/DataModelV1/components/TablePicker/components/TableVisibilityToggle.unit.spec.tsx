import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTableEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { Table } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";

import { TableVisibilityToggle } from "./TableVisibilityToggle";

function setup({ table }: { table: Table }) {
  setupTableEndpoints(table);

  renderWithProviders(
    <>
      <TableVisibilityToggle table={table} onUpdate={jest.fn()} />
      <UndoListing />
    </>,
  );
}

describe("TableVisibilityToggle", () => {
  describe("visible table", () => {
    const VISIBLE_TABLE = createMockTable({
      visibility_type: null,
    });

    it("should have a tooltip that says 'Hide table' when a visible table is hovered", async () => {
      setup({
        table: VISIBLE_TABLE,
      });

      const toggle = screen.getByLabelText("eye icon");
      expect(toggle).toBeInTheDocument();

      await userEvent.hover(toggle);
      expect(await screen.findByText("Hide table")).toBeInTheDocument();
    });

    it("should hide the table when a visible table is clicked", async () => {
      setup({
        table: VISIBLE_TABLE,
      });

      const toggle = screen.getByLabelText("eye icon");
      expect(toggle).toBeInTheDocument();
      await userEvent.click(toggle);

      expect(
        fetchMock.callHistory.calls(`path:/api/table/${VISIBLE_TABLE.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1);

      const call = fetchMock.callHistory.calls(
        `path:/api/table/${VISIBLE_TABLE.id}`,
        {
          method: "PUT",
        },
      )[0];
      const body = await (call.options?.body as unknown as Promise<string>);

      expect(JSON.parse(body)).toEqual({ visibility_type: "hidden" });

      await waitFor(() => {
        const undo = screen.getByTestId("undo-list");
        expect(within(undo).getByText("Hid Table")).toBeInTheDocument();
      });
    });

    it("should show an error when hiding fails", async () => {
      setup({
        table: VISIBLE_TABLE,
      });

      fetchMock.modifyRoute(`table-${VISIBLE_TABLE.id}-put`, {
        response: { status: 500 },
      });

      const toggle = screen.getByLabelText("eye icon");
      expect(toggle).toBeInTheDocument();
      await userEvent.click(toggle);

      expect(
        fetchMock.callHistory.calls(`path:/api/table/${VISIBLE_TABLE.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1);

      await waitFor(() => {
        const undo = screen.getByTestId("undo-list");
        expect(
          within(undo).getByText("Failed to hide Table"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("hidden table", () => {
    const HIDDEN_TABLE = createMockTable({
      visibility_type: "hidden",
    });

    it("should have a tooltip that says 'Unhide table' when a visible table is hovered", async () => {
      setup({
        table: HIDDEN_TABLE,
      });

      const toggle = screen.getByLabelText("eye_crossed_out icon");
      expect(toggle).toBeInTheDocument();

      await userEvent.hover(toggle);
      expect(await screen.findByText("Unhide table")).toBeInTheDocument();
    });

    it("should unhide the table when a visible table is clicked", async () => {
      setup({
        table: HIDDEN_TABLE,
      });

      const toggle = screen.getByLabelText("eye_crossed_out icon");
      expect(toggle).toBeInTheDocument();
      await userEvent.click(toggle);

      expect(
        fetchMock.callHistory.calls(`path:/api/table/${HIDDEN_TABLE.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1);

      const call = fetchMock.callHistory.calls(
        `path:/api/table/${HIDDEN_TABLE.id}`,
        {
          method: "PUT",
        },
      )[0];
      const body = await (call.options?.body as unknown as Promise<string>);

      expect(JSON.parse(body)).toEqual({ visibility_type: null });

      await waitFor(() => {
        const undo = screen.getByTestId("undo-list");
        expect(within(undo).getByText("Unhid Table")).toBeInTheDocument();
      });
    });

    it("should show an error when unhiding fails", async () => {
      setup({
        table: HIDDEN_TABLE,
      });

      fetchMock.removeRoute(`table-${HIDDEN_TABLE.id}-put`);
      fetchMock.put(
        `path:/api/table/${HIDDEN_TABLE.id}`,
        { status: 500 },
        { name: `table-${HIDDEN_TABLE.id}-put` },
      );

      const toggle = screen.getByLabelText("eye_crossed_out icon");
      expect(toggle).toBeInTheDocument();
      await userEvent.click(toggle);

      expect(
        fetchMock.callHistory.calls(`path:/api/table/${HIDDEN_TABLE.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1);

      await waitFor(() => {
        const undo = screen.getByTestId("undo-list");
        expect(
          within(undo).getByText("Failed to unhide Table"),
        ).toBeInTheDocument();
      });
    });
  });
});
