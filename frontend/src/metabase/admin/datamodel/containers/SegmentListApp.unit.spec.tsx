import userEvent from "@testing-library/user-event";

import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupSegmentsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { SegmentListApp } from "./SegmentListApp";

const MULTI_SCHEMA_DB_ID = 10;

const MULTI_SCHEMA_DB = createMockDatabase({
  id: MULTI_SCHEMA_DB_ID,
  name: "Writable Postgres12",
  engine: "postgres",
  tables: [
    createMockTable({
      id: 101,
      db_id: MULTI_SCHEMA_DB_ID,
      schema: "Domestic",
      name: "animals",
      display_name: "Animals",
    }),
    createMockTable({
      id: 102,
      db_id: MULTI_SCHEMA_DB_ID,
      schema: "Wild",
      name: "animals",
      display_name: "Animals",
    }),
    createMockTable({
      id: 103,
      db_id: MULTI_SCHEMA_DB_ID,
      schema: "Wild",
      name: "birds",
      display_name: "Birds",
    }),
  ],
});

interface SetupOpts {
  databases?: Database[];
}

function setup({
  databases = [createSampleDatabase(), MULTI_SCHEMA_DB],
}: SetupOpts = {}) {
  setupDatabasesEndpoints(databases, { hasSavedQuestions: true });
  setupSegmentsEndpoints([]);
  setupSearchEndpoints([]);

  renderWithProviders(
    <Route path="/admin/datamodel/segments" element={<SegmentListApp />} />,
    {
      withRouter: true,
      initialRoute: "/admin/datamodel/segments",
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );
}

describe("SegmentListApp", () => {
  it("should be able to select a table in a database with multiple schemas when there are multiple databases and there is a saved question (metabase#52411)", async () => {
    setup();

    await userEvent.click(await screen.findByText("Filter by table"));
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      await within(popover).findByRole("img", { name: "chevronleft icon" }),
    );
    await userEvent.click(
      await within(popover).findByText("Writable Postgres12"),
    );
    await userEvent.click(await within(popover).findByText("Wild"));
    await userEvent.click(await within(popover).findByText("Birds"));

    expect(
      await within(screen.getByTestId("segment-list-table")).findByText(
        "Birds",
      ),
    ).toBeInTheDocument();
  });
});
