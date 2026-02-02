import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { EnterpriseSettings, Segment, Table } from "metabase-types/api";
import {
  createMockSegment,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import { SegmentList } from "./SegmentList";

type SetupOpts = {
  segments?: Segment[];
  table?: Partial<Table>;
  isAdmin?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

function setup({
  segments = [],
  table = {},
  isAdmin = true,
  remoteSyncType,
}: SetupOpts = {}) {
  const mockTable = createMockTable({
    id: 1,
    db_id: 1,
    schema: "PUBLIC",
    segments,
    is_published: true,
    ...table,
  });

  renderWithProviders(
    <Route path="/" component={() => <SegmentList table={mockTable} />} />,
    {
      withRouter: true,
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: mockSettings({
          "remote-sync-type": remoteSyncType,
          "remote-sync-enabled": !!remoteSyncType,
        }),
      },
    },
  );
}

describe("SegmentList", () => {
  it("should render empty state when no segments", () => {
    setup({ segments: [] });

    expect(screen.getByText("No segments yet")).toBeInTheDocument();
    expect(
      screen.getByText("Create a segment to filter rows in this table."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /New segment/i }),
    ).toBeInTheDocument();
  });

  describe("'new segment' link", () => {
    it("is rendered when user is an admin", () => {
      setup({ segments: [], isAdmin: true });

      expect(
        screen.getByRole("link", { name: /New segment/i }),
      ).toBeInTheDocument();
    });

    it("is not rendered when user is not an admin", () => {
      setup({ segments: [], isAdmin: false });

      expect(
        screen.queryByRole("link", { name: /New segment/i }),
      ).not.toBeInTheDocument();
    });

    it("is not rendered when remote sync is set to read-only", () => {
      setup({ segments: [], isAdmin: true, remoteSyncType: "read-only" });

      expect(
        screen.queryByRole("link", { name: /New segment/i }),
      ).not.toBeInTheDocument();
    });

    it("is still rendered when remote sync is set to read-only but table is not published", () => {
      setup({
        segments: [],
        isAdmin: true,
        remoteSyncType: "read-only",
        table: { is_published: false },
      });

      expect(
        screen.getByRole("link", { name: /New segment/i }),
      ).toBeInTheDocument();
    });
  });

  it("should render segment items", () => {
    const segments = [
      createMockSegment({
        id: 1,
        name: "High Value",
        definition_description: "Price > 100",
      }),
      createMockSegment({ id: 2, name: "Active Users" }),
    ];
    setup({ segments });

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("High Value")).toBeInTheDocument();
    expect(screen.getByText("Price > 100")).toBeInTheDocument();
    expect(screen.getByText("Active Users")).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "High Value" }),
    ).toHaveAttribute(
      "href",
      "/data-studio/data/database/1/schema/1:PUBLIC/table/1/segments/1",
    );
  });
});
