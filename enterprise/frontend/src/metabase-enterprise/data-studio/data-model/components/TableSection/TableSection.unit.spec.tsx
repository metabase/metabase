import { Route } from "react-router";

import {
  setupUserKeyValueEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { DataStudioTableMetadataTab } from "metabase/lib/urls/data-studio";
import type { Segment, Table } from "metabase-types/api";
import {
  createMockSegment,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import type { RouteParams } from "../../pages/DataModel/types";

import { TableSection } from "./TableSection";

type SetupOpts = {
  table?: Table;
  params?: RouteParams;
  activeTab?: DataStudioTableMetadataTab;
  segments?: Segment[];
};

function setup({
  table = createMockTable(),
  activeTab = "field",
  segments,
}: SetupOpts = {}) {
  const onSyncOptionsClick = jest.fn();

  const tableWithSegments = segments ? { ...table, segments } : table;

  setupUsersEndpoints([createMockUser()]);
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "seen-publish-tables-info",
    value: true,
  });

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <TableSection
          table={tableWithSegments}
          activeTab={activeTab}
          hasLibrary
          onSyncOptionsClick={onSyncOptionsClick}
        />
      )}
    />,
    { withRouter: true },
  );

  return { onSyncOptionsClick };
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
