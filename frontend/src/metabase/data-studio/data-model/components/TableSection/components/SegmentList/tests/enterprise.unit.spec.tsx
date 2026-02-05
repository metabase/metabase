import { screen } from "__support__/ui";
import { createMockSegment } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("SegmentList", () => {
  it("should render empty state when no segments", () => {
    setup({ isEnterprise: true, segments: [] });

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
      setup({ isEnterprise: true, segments: [], isAdmin: true });

      expect(
        screen.getByRole("link", { name: /New segment/i }),
      ).toBeInTheDocument();
    });

    it("is not rendered when user is not an admin", () => {
      setup({ isEnterprise: true, segments: [], isAdmin: false });

      expect(
        screen.queryByRole("link", { name: /New segment/i }),
      ).not.toBeInTheDocument();
    });

    it("is not rendered when remote sync is set to read-only", () => {
      setup({
        isEnterprise: true,
        segments: [],
        isAdmin: true,
        remoteSyncType: "read-only",
      });

      expect(
        screen.queryByRole("link", { name: /New segment/i }),
      ).not.toBeInTheDocument();
    });

    it("is still rendered when remote sync is set to read-only but table is not published", () => {
      setup({
        isEnterprise: true,
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
    setup({ isEnterprise: true, segments });

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
