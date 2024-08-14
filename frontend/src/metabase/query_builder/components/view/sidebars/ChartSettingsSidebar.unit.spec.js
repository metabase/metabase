import { render, fireEvent, screen } from "@testing-library/react";

import { createMockMetadata } from "__support__/metadata";
import ChartSettingsSidebar from "metabase/query_builder/components/view/sidebars/ChartSettingsSidebar";
import registerVisualizations from "metabase/visualizations/register";
import {
  createSampleDatabase,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

registerVisualizations();

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});
const db = metadata.database(SAMPLE_DB_ID);

describe("ChartSettingsSidebar", () => {
  const data = {
    rows: [[1]],
    cols: [{ base_type: "type/Integer", name: "foo", display_name: "foo" }],
  };

  it("should hide the title when showSidebarTitle is false", () => {
    render(
      <ChartSettingsSidebar
        question={db.question().setDisplay("gauge")}
        result={{ data }}
        showSidebarTitle={false}
      />,
    );

    // see options header with sections
    expect(screen.queryByText("Gauge options")).not.toBeInTheDocument();
    expect(screen.getByText("Formatting")).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();

    // click on formatting section
    fireEvent.click(screen.getByText("Formatting"));

    // you see the formatting stuff
    expect(screen.getByText("Style")).toBeInTheDocument();

    // but the sections and back title are unchanged
    expect(screen.queryByText("Gauge options")).not.toBeInTheDocument();
    expect(screen.getByText("Formatting")).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
  });

  it("should not hide the title when showSidebarTitle is false", () => {
    render(
      <ChartSettingsSidebar
        question={db.question().setDisplay("scalar")}
        result={{ data }}
        showSidebarTitle={true}
      />,
    );

    // see header with formatting fields
    expect(screen.getByText("Number options")).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
  });
});
