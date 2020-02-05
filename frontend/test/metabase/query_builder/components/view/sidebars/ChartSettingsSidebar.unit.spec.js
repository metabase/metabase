import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, fireEvent, cleanup } from "@testing-library/react";

import { SAMPLE_DATASET } from "__support__/sample_dataset_fixture";

import ChartSettingsSidebar from "metabase/query_builder/components/view/sidebars/ChartSettingsSidebar";

describe("ChartSettingsSidebar", () => {
  const data = {
    rows: [[1]],
    cols: [{ base_type: "type/Integer", name: "foo", display_name: "foo" }],
  };
  afterEach(cleanup);

  it("should hide title and section picker when viewing column settings", () => {
    const { container, getByText, queryByText } = render(
      <ChartSettingsSidebar
        question={SAMPLE_DATASET.question()}
        result={{ data }}
      />,
    );
    getByText("Table options");
    getByText("Conditional Formatting");
    fireEvent.click(container.querySelector(".Icon-gear"));
    expect(queryByText("Table options")).toBe(null);
    expect(queryByText("Conditional Formatting")).toBe(null);
  });

  it("should not hide the title for gauge charts", () => {
    const { getByText } = render(
      <ChartSettingsSidebar
        question={SAMPLE_DATASET.question().setDisplay("gauge")}
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
        question={SAMPLE_DATASET.question().setDisplay("scalar")}
        result={{ data }}
      />,
    );
    // see header with formatting fields
    getByText("Number options");
    getByText("Style");
  });
});
