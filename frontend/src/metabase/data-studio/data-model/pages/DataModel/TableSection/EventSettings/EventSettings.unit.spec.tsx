import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTableEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Table } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { EventSettings } from "./EventSettings";

const TABLE = createMockTable({
  entity_type: "entity/EventTable",
  fields: [
    createMockField({ id: 1, name: "ts", base_type: "type/DateTime" }),
    createMockField({ id: 2, name: "user_id", base_type: "type/Text" }),
    createMockField({ id: 3, name: "event_name", base_type: "type/Text" }),
    createMockField({ id: 4, name: "path", base_type: "type/Text" }),
  ],
  detected_event_settings: {
    schema: "snowplow",
    settings: {
      "columns.timestamp": "ts",
      "columns.person": "user_id",
      "columns.event_name": "event_name",
    },
  },
});

type SetupOpts = {
  eventSettings?: Table["event_settings"];
  entityType?: Table["entity_type"];
  readOnly?: boolean;
};

const setup = ({
  eventSettings = {},
  entityType = TABLE.entity_type,
  readOnly = false,
}: SetupOpts = {}) => {
  const table = {
    ...TABLE,
    event_settings: eventSettings,
    entity_type: entityType,
  };
  setupTableEndpoints(table);
  renderWithProviders(<EventSettings table={table} readOnly={readOnly} />);
};

const getLastUpdate = async (): Promise<unknown> =>
  fetchMock.callHistory.lastCall(`table-${TABLE.id}-put`)?.request?.json();

describe("EventSettings", () => {
  it("groups the settings into sections", () => {
    setup();

    expect(
      screen.getAllByRole("heading").map((heading) => heading.textContent),
    ).toEqual(["Required", "Optional", "Pageviews (optional)"]);
    expect(screen.getByText("URL path column")).toBeInTheDocument();
  });

  it("hides pageviews and path cleaning without a URL path", () => {
    setup();
    expect(
      screen.queryByText("How do you define a pageview?"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Path cleaning")).not.toBeInTheDocument();
  });

  it("shows the pages settings for a table with a URL path", () => {
    setup({ eventSettings: { "columns.url_path": "path" } });

    expect(
      screen.getByText("How do you define a pageview?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Path cleaning")).toBeInTheDocument();
  });

  it("names the detected schema", () => {
    setup({ eventSettings: { "columns.url_path": "path" } });

    expect(
      screen.getByText("Detected as an event table from Snowplow."),
    ).toBeInTheDocument();
  });

  it("doesn't offer a reset while the settings are the detected ones", () => {
    setup();

    expect(
      screen.queryByRole("button", { name: "Reset to Snowplow defaults" }),
    ).not.toBeInTheDocument();
  });

  it("resets every setting once confirmed", async () => {
    setup({
      eventSettings: {
        "columns.url_path": "path",
        path_cleaning: [{ pattern: "/[0-9]+", replacement: "/:id" }],
      },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Reset to Snowplow defaults" }),
    );
    expect(fetchMock.callHistory.called(`table-${TABLE.id}-put`)).toBe(false);

    await userEvent.click(await screen.findByRole("button", { name: "Reset" }));
    await waitFor(async () =>
      expect(await getLastUpdate()).toEqual({ event_settings: {} }),
    );
  });

  it("can't be changed by someone who can't edit the table", () => {
    setup({
      eventSettings: { "columns.url_path": "path" },
      readOnly: true,
    });

    for (const input of screen.getAllByRole("textbox")) {
      expect(input).toBeDisabled();
    }
    expect(
      screen.queryByRole("button", { name: "Reset to Snowplow defaults" }),
    ).not.toBeInTheDocument();
  });

  describe("a table that isn't an event table", () => {
    it("keeps its settings disabled until it's used as an event table", async () => {
      setup({ entityType: "entity/GenericTable" });

      expect(
        screen.getByText(
          "Only tables with an Event entity type can be used in product analysis.",
        ),
      ).toBeInTheDocument();
      for (const input of screen.getAllByRole("textbox")) {
        expect(input).toBeDisabled();
      }

      await userEvent.click(
        screen.getByRole("button", { name: "Set entity type to Event" }),
      );
      await waitFor(async () =>
        expect(await getLastUpdate()).toEqual({
          entity_type: "entity/EventTable",
        }),
      );
      expect(fetchMock.callHistory.calls(`table-${TABLE.id}-put`)).toHaveLength(
        1,
      );
    });

    it("doesn't offer to change it to someone who can't edit the table", () => {
      setup({ entityType: "entity/GenericTable", readOnly: true });

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

  it("doesn't mention the entity type on an event table", () => {
    setup();

    expect(
      screen.queryByRole("button", { name: "Set entity type to Event" }),
    ).not.toBeInTheDocument();
    for (const input of screen.getAllByRole("textbox")) {
      expect(input).toBeEnabled();
    }
  });
});
