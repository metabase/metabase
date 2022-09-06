import React from "react";
import { render, fireEvent } from "@testing-library/react";

import { SAMPLE_DATABASE } from "__support__/sample_database_fixture";

import ChartSettingsSidebar from "metabase/query_builder/components/view/sidebars/ChartSettingsSidebar";

describe("ChartSettingsSidebar", () => {
  const data = {
    rows: [[1]],
    cols: [{ base_type: "type/Integer", name: "foo", display_name: "foo" }],
  };

  it("should not hide the title for gauge charts", () => {
    const { getByText } = render(
      <ChartSettingsSidebar
        question={SAMPLE_DATABASE.question().setDisplay("gauge")}
        result={{ data }}
      />,
    );
    // see options header with sections
    getByText("Gauge options");
    getByText("Formatting");
    getByText("Display");

    // click on formatting section
    fireEvent.click(getByText("Formatting"));

    // you see the formatting stuff
    getByText("Style");
    // but the sections and back title are unchanged
    getByText("Gauge options");
    getByText("Formatting");
    getByText("Display");
  });

  it("should not hide the title for scalar charts", () => {
    const { getByText } = render(
      <ChartSettingsSidebar
        question={SAMPLE_DATABASE.question().setDisplay("scalar")}
        result={{ data }}
      />,
    );
    // see header with formatting fields
    getByText("Number options");
    getByText("Style");
  });
});
