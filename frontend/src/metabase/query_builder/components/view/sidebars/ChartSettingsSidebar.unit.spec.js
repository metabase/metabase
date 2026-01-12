import { createMockMetadata } from "__support__/metadata";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import {
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "metabase-types/store/mocks";

import { ChartSettingsSidebar } from "./ChartSettingsSidebar";

registerVisualizations();

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});
const table = metadata.table(PRODUCTS_ID);

describe("ChartSettingsSidebar", () => {
  const data = {
    rows: [[1]],
    cols: [{ base_type: "type/Integer", name: "foo", display_name: "foo" }],
  };

  it("should hide the title when showSidebarTitle is false", () => {
    renderWithProviders(
      <ChartSettingsSidebar
        question={table.question().setDisplay("gauge")}
        result={{ data }}
        showSidebarTitle={false}
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

  it("should not hide the title when showSidebarTitle is false", () => {
    renderWithProviders(
      <ChartSettingsSidebar
        question={table.question().setDisplay("scalar")}
        result={{ data }}
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
