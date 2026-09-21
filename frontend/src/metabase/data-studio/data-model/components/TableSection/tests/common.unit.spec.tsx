import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import {
  createMockDatabase,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";

import { setup } from "./setup";

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

  describe("actions menu", () => {
    it("should expose the sync actions in the actions menu", async () => {
      setup();

      await userEvent.click(
        screen.getByRole("button", { name: "More actions" }),
      );

      expect(
        await screen.findByRole("menuitem", { name: /Re-sync schema/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Re-scan field values/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Discard cached field values/ }),
      ).toBeInTheDocument();
    });

    it("should trigger a field values rescan from the actions menu", async () => {
      const table = createMockTable();
      setup({ table });

      await userEvent.click(
        screen.getByRole("button", { name: "More actions" }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Re-scan field values/ }),
      );

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls(
            "path:/api/data-studio/table/rescan-values",
            { method: "POST" },
          ),
        ).toHaveLength(1);
      });
    });

    it("should expose the schema viewer in the actions menu", async () => {
      setup();

      await userEvent.click(
        screen.getByRole("button", { name: "More actions" }),
      );

      expect(
        await screen.findByRole("menuitem", { name: /View schema/ }),
      ).toBeInTheDocument();
    });

    it("should not expose sync actions when the database is datawarehouse attached", () => {
      setup({
        database: createMockDatabase({ is_attached_dwh: true }),
      });

      // With no sync actions and no source replacement, the menu collapses to a
      // standalone schema viewer link rather than a "More actions" menu.
      expect(
        screen.getByRole("link", { name: /View schema/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "More actions" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("tabs", () => {
    it("should render Fields and Segments tabs", () => {
      setup({ activeTab: "field" });

      expect(screen.getByRole("tab", { name: /Fields/i })).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: /Segments/i }),
      ).toBeInTheDocument();
    });

    it("should show Fields tab as selected when activeTab is field", () => {
      setup({ activeTab: "field" });

      expect(screen.getByRole("tab", { name: /Fields/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("tab", { name: /Segments/i })).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should show Segments tab as selected when activeTab is segments", () => {
      setup({ activeTab: "segments" });

      expect(screen.getByRole("tab", { name: /Segments/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("tab", { name: /Fields/i })).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should show segment list content in segments tab", () => {
      const segments = [createMockSegment({ id: 1, name: "Test Segment" })];
      setup({ activeTab: "segments", segments });

      expect(screen.getByText("Test Segment")).toBeInTheDocument();
    });

    it("should show empty state when no segments exist in segments tab", () => {
      setup({ activeTab: "segments", segments: [] });

      expect(screen.getByText("No segments yet")).toBeInTheDocument();
    });
  });
});
