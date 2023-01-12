import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";

import { SAMPLE_DATABASE } from "__support__/sample_database_fixture";

import ChartSettingsSidebar from "metabase/query_builder/components/view/sidebars/ChartSettingsSidebar";

describe("ChartSettingsSidebar", () => {
  const data = {
    rows: [[1]],
    cols: [{ base_type: "type/Integer", name: "foo", display_name: "foo" }],
  };

  it("should not hide the title for gauge charts", () => {
    render(
      <ChartSettingsSidebar
        question={SAMPLE_DATABASE.question().setDisplay("gauge")}
        result={{ data }}
      />,
    );

    // see options header with sections
    expect(screen.getByText("Gauge options")).toBeInTheDocument();
    expect(screen.getByText("Formatting")).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();

    // click on formatting section
    fireEvent.click(screen.getByText("Formatting"));

    // you see the formatting stuff
    expect(screen.getByText("Style")).toBeInTheDocument();

    // but the sections and back title are unchanged
    expect(screen.getByText("Gauge options")).toBeInTheDocument();
    expect(screen.getByText("Formatting")).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
  });

  it("should not hide the title for scalar charts", () => {
    render(
      <ChartSettingsSidebar
        question={SAMPLE_DATABASE.question().setDisplay("scalar")}
        result={{ data }}
      />,
    );

    // see header with formatting fields
    expect(screen.getByText("Number options")).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
  });
});
