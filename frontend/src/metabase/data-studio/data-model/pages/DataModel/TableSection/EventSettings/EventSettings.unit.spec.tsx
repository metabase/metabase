import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTableEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { checkNotNull } from "metabase/utils/types";
import type { EventTableSettings, Table } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { EventSettings } from "./EventSettings";

const TABLE = createMockTable({
  entity_type: "entity/EventTable",
  fields: [
    createMockField({
      id: 1,
      name: "created_at",
      display_name: "Created At",
      base_type: "type/DateTime",
      effective_type: "type/DateTime",
    }),
    createMockField({
      id: 2,
      name: "user_id",
      display_name: "User ID",
      base_type: "type/Text",
      effective_type: "type/Text",
    }),
    createMockField({
      id: 3,
      name: "event",
      display_name: "Event",
      base_type: "type/Text",
      effective_type: "type/Text",
    }),
    createMockField({
      id: 4,
      name: "session_id",
      display_name: "Session ID",
      base_type: "type/Text",
      effective_type: "type/Text",
    }),
  ],
});

const SET_UP_SETTINGS: EventTableSettings = {
  "columns.timestamp": "created_at",
  "columns.person": "user_id",
};

type SetupOpts = {
  eventSettings?: Table["event_settings"];
  entityType?: Table["entity_type"];
  canWrite?: boolean;
};

function setup({
  eventSettings = null,
  entityType = TABLE.entity_type,
  canWrite = true,
}: SetupOpts = {}) {
  const table = {
    ...TABLE,
    event_settings: eventSettings,
    entity_type: entityType,
    can_write: canWrite,
  };
  setupTableEndpoints(table);
  renderWithProviders(
    <>
      <EventSettings table={table} />
      <UndoListing />
    </>,
  );
}

function getTableUpdates(): unknown[] {
  return fetchMock.callHistory
    .calls(`table-${TABLE.id}-put`)
    .map((call) => JSON.parse(String(call.options.body)));
}

async function pickColumn(label: string, columnName: string) {
  await userEvent.click(screen.getByRole("textbox", { name: label }));
  const option = (await screen.findAllByRole("option")).find(
    (option) => option.textContent === columnName,
  );
  await userEvent.click(checkNotNull(option));
}

describe("EventSettings", () => {
  it("shows the column roles in required and optional sections", () => {
    setup({
      eventSettings: { ...SET_UP_SETTINGS, "columns.session": "session_id" },
    });

    expect(
      screen
        .getAllByText(
          /^(Required|Optional|Event time|Person|Event name|Session)$/,
        )
        .map((element) => element.textContent),
    ).toEqual([
      "Required",
      "Event time",
      "Person",
      "Optional",
      "Event name",
      "Session",
    ]);
    expect(screen.getByRole("textbox", { name: "Event time" })).toHaveValue(
      "Created At",
    );
    expect(screen.getByRole("textbox", { name: "Person" })).toHaveValue(
      "User ID",
    );
    expect(screen.getByRole("textbox", { name: "Event name" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Session" })).toHaveValue(
      "Session ID",
    );
  });

  it("offers only date columns for the event time", async () => {
    setup();

    await userEvent.click(screen.getByRole("textbox", { name: "Event time" }));

    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["Created At"]);
  });

  it("saves a picked column and keeps the other roles", async () => {
    setup({
      eventSettings: { ...SET_UP_SETTINGS, "columns.url_path": "path" },
    });

    await pickColumn("Event name", "Event");

    await waitFor(() => {
      expect(getTableUpdates()).toEqual([
        {
          event_settings: {
            ...SET_UP_SETTINGS,
            "columns.url_path": "path",
            "columns.event_name": "event",
          },
        },
      ]);
    });
    expect(
      await screen.findByText("Event settings updated"),
    ).toBeInTheDocument();
  });

  it("saves an explicit null when an optional column is cleared", async () => {
    setup({
      eventSettings: { ...SET_UP_SETTINGS, "columns.session": "session_id" },
    });

    await pickColumn("Session", "Session ID");

    await waitFor(() => {
      expect(getTableUpdates()).toEqual([
        { event_settings: { ...SET_UP_SETTINGS, "columns.session": null } },
      ]);
    });
  });

  it("restores the previous settings on undo", async () => {
    setup({ eventSettings: SET_UP_SETTINGS });

    await pickColumn("Session", "Session ID");
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(getTableUpdates()).toEqual([
        {
          event_settings: {
            ...SET_UP_SETTINGS,
            "columns.session": "session_id",
          },
        },
        { event_settings: SET_UP_SETTINGS },
      ]);
    });
  });

  it("clears every role on undo when none were set", async () => {
    setup();

    await pickColumn("Session", "Session ID");
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(getTableUpdates()).toEqual([
        { event_settings: { "columns.session": "session_id" } },
        { event_settings: {} },
      ]);
    });
  });

  it("shows an error when saving fails", async () => {
    setup();
    fetchMock.modifyRoute(`table-${TABLE.id}-put`, { response: 500 });

    await pickColumn("Session", "Session ID");

    expect(
      await screen.findByText("Failed to update event settings"),
    ).toBeInTheDocument();
  });

  it("asks for the required columns until they're set", () => {
    setup({ eventSettings: { "columns.timestamp": "created_at" } });

    expect(
      screen.getByText(
        "Pick the required columns to make this table available in product analysis.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/is ready for product analysis/),
    ).not.toBeInTheDocument();
  });

  it("says the table is ready once it's set up", () => {
    setup({ eventSettings: SET_UP_SETTINGS });

    expect(
      screen.getByText("This table is ready for product analysis."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Pick the required columns/),
    ).not.toBeInTheDocument();
  });

  describe("without metadata permission", () => {
    it("is read-only", () => {
      setup({ canWrite: false });

      expect(
        screen.getByRole("textbox", { name: "Event time" }),
      ).toBeDisabled();
      expect(screen.getByRole("textbox", { name: "Session" })).toBeDisabled();
      expect(
        screen.getByText(
          "This table needs an event time and a person column before product analysis can use it.",
        ),
      ).toBeInTheDocument();
    });

    it("doesn't offer to set the entity type", () => {
      setup({ canWrite: false, entityType: "entity/GenericTable" });

      expect(
        screen.getByText(
          "Only tables with an Event entity type can be used in product analysis.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Set entity type to Event" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("on a table that isn't an event table", () => {
    it("doesn't say the table is ready, even with its columns set", () => {
      setup({
        entityType: "entity/GenericTable",
        eventSettings: SET_UP_SETTINGS,
      });

      expect(
        screen.queryByText(/is ready for product analysis/),
      ).not.toBeInTheDocument();
    });

    it("disables the column roles", () => {
      setup({ entityType: "entity/GenericTable" });

      expect(
        screen.getByText(
          "Only tables with an Event entity type can be used in product analysis.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Event time" }),
      ).toBeDisabled();
      expect(screen.getByRole("textbox", { name: "Person" })).toBeDisabled();
    });

    it("sets the entity type to Event", async () => {
      setup({ entityType: "entity/GenericTable" });

      await userEvent.click(
        screen.getByRole("button", { name: "Set entity type to Event" }),
      );

      await waitFor(() => {
        expect(getTableUpdates()).toEqual([
          { entity_type: "entity/EventTable" },
        ]);
      });
      expect(
        await screen.findByText("Entity type updated"),
      ).toBeInTheDocument();
    });
  });
});
