import { screen } from "__support__/ui";
import { createMockSegment, createMockTable } from "metabase-types/api/mocks";

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
