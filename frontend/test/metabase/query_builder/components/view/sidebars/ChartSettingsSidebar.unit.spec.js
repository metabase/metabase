import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, fireEvent } from "@testing-library/react";

import { SAMPLE_DATASET } from "__support__/sample_dataset_fixture";

import ChartSettingsSidebar from "metabase/query_builder/components/view/sidebars/ChartSettingsSidebar";

describe("ChartSettingsSidebar", () => {
  it("should hide title and section picker when viewing column settings", () => {
    const data = {
      rows: [["bar"]],
      cols: [{ base_type: "type/Text", name: "foo", display_name: "foo" }],
    };
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
});
