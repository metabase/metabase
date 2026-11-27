import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import {
  createMockDatabase,
  createMockField,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";
import { createOrdersQuantityField } from "metabase-types/api/mocks/presets";

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

    it("should expose the schema viewer for this table in the actions menu", async () => {
      const database = createMockDatabase({ id: 7 });
      setup({
        database,
        table: createMockTable({
          id: 42,
          db_id: 7,
          schema: "analytics",
          db: database,
        }),
      });

      await userEvent.click(
        screen.getByRole("button", { name: "More actions" }),
      );

      expect(
        await screen.findByRole("menuitem", { name: /View schema/ }),
      ).toHaveAttribute(
        "href",
        "/data-studio/schema-viewer?database-id=7&schema=analytics&table-ids=42",
      );
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
    describe("events", () => {
      const EVENT_TABLE = createMockTable({
        entity_type: "entity/EventTable",
        fields: [
          createMockField({
            id: 1,
            name: "created_at",
            base_type: "type/DateTime",
            effective_type: "type/DateTime",
          }),
          createMockField({ id: 2, name: "user_id", base_type: "type/Text" }),
        ],
      });
      const SET_UP_EVENT_TABLE = {
        ...EVENT_TABLE,
        event_settings: {
          "columns.timestamp": "created_at",
          "columns.person": "user_id",
        },
      };
      const GENERIC_TABLE = createMockTable({
        entity_type: "entity/GenericTable",
      });

      const queryEventsTabWarning = () =>
        within(screen.getByRole("tab", { name: /Events/ })).queryByRole("img", {
          name: /warning/,
        });

      it("shows the Events tab for an event table", () => {
        setup({ table: SET_UP_EVENT_TABLE });

        expect(screen.getByRole("tab", { name: /Events/ })).toBeInTheDocument();
      });

      it("doesn't show the Events tab for another table", () => {
        setup({ table: GENERIC_TABLE });

        expect(
          screen.queryByRole("tab", { name: /Events/ }),
        ).not.toBeInTheDocument();
      });

      it("shows the Events tab for another table opened on it, to set it up", () => {
        setup({ table: GENERIC_TABLE, activeTab: "events" });

        expect(screen.getByRole("tab", { name: /Events/ })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        expect(
          screen.getByRole("button", { name: "Set entity type to Event" }),
        ).toBeInTheDocument();
      });

      it("warns on the tab while a required column is missing", () => {
        setup({ table: EVENT_TABLE });

        expect(queryEventsTabWarning()).toBeInTheDocument();
      });

      it("warns on the tab while the table isn't an event table", () => {
        setup({
          table: {
            ...SET_UP_EVENT_TABLE,
            entity_type: "entity/GenericTable",
          },
          activeTab: "events",
        });

        expect(queryEventsTabWarning()).toBeInTheDocument();
      });

      it("doesn't warn about an event table that's set up", () => {
        setup({ table: SET_UP_EVENT_TABLE });

        expect(queryEventsTabWarning()).not.toBeInTheDocument();
      });
    });

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

  describe("read-only table", () => {
    const READ_ONLY_TABLE = createMockTable({
      db: createMockDatabase(),
      can_write: false,
      fields: [createOrdersQuantityField()],
    });

    it("shows the details of a table that cannot be written as read-only", async () => {
      setup({ table: READ_ONLY_TABLE });

      expect(
        screen.getByPlaceholderText("Give this table a name"),
      ).toHaveAttribute("readonly");
      expect(
        screen.getByPlaceholderText("Give this table a description"),
      ).toHaveAttribute("readonly");
      expect(
        screen.getByPlaceholderText("Pick someone, or type an email"),
      ).toBeDisabled();
      expect(
        screen.getByPlaceholderText("Select visibility layer"),
      ).toBeDisabled();
      expect(screen.getByPlaceholderText("Select entity type")).toBeDisabled();
      expect(
        screen.getByPlaceholderText("Select a data source"),
      ).toBeDisabled();

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

    it("shows the fields of a table that cannot be written as read-only", () => {
      setup({ table: READ_ONLY_TABLE, activeTab: "field" });

      expect(
        screen.queryByRole("button", { name: /Sorting/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Give this field a name"),
      ).toBeDisabled();
    });

    it("keeps the details and fields of a writable table editable", () => {
      setup({
        table: { ...READ_ONLY_TABLE, can_write: true },
        activeTab: "field",
      });

      expect(screen.getByRole("button", { name: /Sorting/ })).toBeEnabled();
      expect(
        screen.getByPlaceholderText("Give this field a name"),
      ).toBeEnabled();
    });
  });
});
