import { screen } from "__support__/ui";
import { createMockMeasure } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("MeasureList", () => {
  it("should render empty state when no measures", () => {
    setup({ isEnterprise: true, measures: [] });

    expect(screen.getByText("No measures yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Create a measure to define a reusable aggregation for this table.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /New measure/i }),
    ).toBeInTheDocument();
  });

  it("should render measure items", () => {
    const measures = [
      createMockMeasure({
        id: 1,
        name: "Total Revenue",
        definition_description: "Sum of Total",
      }),
      createMockMeasure({ id: 2, name: "Order Count" }),
    ];
    setup({ isEnterprise: true, measures });

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    expect(screen.getByText("Sum of Total")).toBeInTheDocument();
    expect(screen.getByText("Order Count")).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "Total Revenue" }),
    ).toHaveAttribute(
      "href",
      "/data-studio/data/database/1/schema/1:PUBLIC/table/1/measures/1",
    );
  });

  describe("'new measure' link", () => {
    it("is rendered when user is an admin", () => {
      setup({ isEnterprise: true, measures: [], isAdmin: true });

      expect(
        screen.getByRole("link", { name: /New measure/i }),
      ).toBeInTheDocument();
    });

    it("is not rendered when user is not an admin", () => {
      setup({ isEnterprise: true, measures: [], isAdmin: false });

      expect(
        screen.queryByRole("link", { name: /New measure/i }),
      ).not.toBeInTheDocument();
    });

    it("is not rendered when remote sync is set to read-only", () => {
      setup({
        isEnterprise: true,
        measures: [],
        isAdmin: true,
        remoteSyncType: "read-only",
      });

      expect(
        screen.queryByRole("link", { name: /New measure/i }),
      ).not.toBeInTheDocument();
    });

    it("is still rendered when remote sync is set to read-only but table is not published", () => {
      setup({
        isEnterprise: true,
        measures: [],
        isAdmin: true,
        remoteSyncType: "read-only",
        table: { is_published: false },
      });

      expect(
        screen.getByRole("link", { name: /New measure/i }),
      ).toBeInTheDocument();
    });
  });
});
