import {
  setupActionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import registerVisualizations from "metabase/visualizations/register";
import type { FieldVisibilityType } from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

registerVisualizations();

function setup({
  rows,
  longNameVisibility = "normal",
}: {
  rows: string[][];
  longNameVisibility: FieldVisibilityType;
}) {
  const series = [
    createMockSingleSeries(
      { display: "object" },
      {
        data: {
          rows,
          cols: [
            createMockColumn({
              base_type: "string",
              name: "Short name",
              display_name: "Short name",
            }),
            createMockColumn({
              base_type: "string",
              name: "Long name",
              display_name: "Long name",
              visibility_type: longNameVisibility,
            }),
          ],
        },
      },
    ),
  ];

  setupDatabasesEndpoints([createSampleDatabase()]);
  setupActionsEndpoints([]);

  renderWithProviders(<Visualization rawSeries={series} />);
}

describe("visualization - object", () => {
  it("render fields with 'visibility_type' set as 'details-only'", () => {
    const rows = [["John", "John Smith Jr"]];

    setup({ rows, longNameVisibility: "details-only" });

    expect(screen.getByText("Long name")).toBeInTheDocument();
    expect(screen.getByText("John Smith Jr")).toBeInTheDocument();
  });
});
