import { createMockMetadata } from "__support__/metadata";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import { createMockColumn, createMockDataset } from "metabase-types/api/mocks";
import {
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { ChartSettingsSidebar } from "./ChartSettingsSidebar";

registerVisualizations();

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});
const table = checkNotNull(metadata.table(PRODUCTS_ID));

describe("ChartSettingsSidebar", () => {
  const result = createMockDataset({
    data: {
      rows: [[1]],
      cols: [
        createMockColumn({
          base_type: "type/Integer",
          name: "foo",
          display_name: "foo",
        }),
      ],
    },
  });

  it("hides the gauge options header while keeping formatting sections visible", () => {
    renderWithProviders(
      <ChartSettingsSidebar
        question={table.question().setDisplay("gauge")}
        result={result}
      />,
    );

    // see options header with sections
    expect(screen.queryByText("Gauge options")).not.toBeInTheDocument();
    expect(screen.getByText("Formatting")).toBeInTheDocument();
    expect(screen.getByText("Ranges")).toBeInTheDocument();

    // click on formatting section
    fireEvent.click(screen.getByText("Formatting"));

    // you see the formatting stuff
    expect(screen.getByText("Style")).toBeInTheDocument();

    // but the sections and back title are unchanged
    expect(screen.queryByText("Gauge options")).not.toBeInTheDocument();
    expect(screen.getByText("Formatting")).toBeInTheDocument();
    expect(screen.getByText("Ranges")).toBeInTheDocument();
  });

  it("shows the number options header for scalar display when showSidebarTitle is true", () => {
    renderWithProviders(
      <ChartSettingsSidebar
        question={table.question().setDisplay("scalar")}
        result={result}
      />,
      {
        storeInitialState: createMockState({
          qb: createMockQueryBuilderState({
            uiControls: createMockQueryBuilderUIControlsState({
              showSidebarTitle: true,
            }),
          }),
        }),
      },
    );

    // see header with formatting fields
    expect(screen.getByText("Number options")).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
  });
});
