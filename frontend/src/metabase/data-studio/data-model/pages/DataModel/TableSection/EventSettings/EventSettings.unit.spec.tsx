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
};

const setup = ({ eventSettings = {} }: SetupOpts = {}) => {
  const table = { ...TABLE, event_settings: eventSettings };
  setupTableEndpoints(table);
  renderWithProviders(<EventSettings table={table} />);
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
      screen.getByText("Detected as a Snowplow event table."),
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
});
