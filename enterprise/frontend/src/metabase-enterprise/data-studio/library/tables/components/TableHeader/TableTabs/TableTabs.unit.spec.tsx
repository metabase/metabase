import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";

import { TableTabs } from "./TableTabs";

type SetupOpts = {
  table: Table;
  initialRoute?: string;
};

function setup({ table, initialRoute }: SetupOpts) {
  renderWithProviders(
    <Route path="*" element={<TableTabs table={table} />} />,
    {
      withRouter: true,
      initialRoute: initialRoute ?? Urls.dataStudioTable(table.id),
    },
  );
}

describe("TableTabs", () => {
  it("shows the Events tab for an event table", () => {
    const table = createMockTable({ entity_type: "entity/EventTable" });
    setup({ table });

    expect(screen.getByRole("tab", { name: "Events" })).toHaveAttribute(
      "href",
      Urls.dataStudioTableEvents(table.id),
    );
  });

  it("doesn't show the Events tab for another table", () => {
    setup({ table: createMockTable({ entity_type: "entity/GenericTable" }) });

    expect(
      screen.queryByRole("tab", { name: "Events" }),
    ).not.toBeInTheDocument();
  });

  it("shows the Events tab while its URL is open, even for another table", () => {
    const table = createMockTable({ entity_type: "entity/GenericTable" });
    setup({ table, initialRoute: Urls.dataStudioTableEvents(table.id) });

    expect(screen.getByRole("tab", { name: "Events" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
