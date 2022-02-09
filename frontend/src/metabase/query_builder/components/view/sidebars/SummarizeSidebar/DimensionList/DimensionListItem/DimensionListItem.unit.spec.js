import React from "react";
import { render } from "@testing-library/react";
import { metadata, ORDERS } from "__support__/sample_database_fixture";

import Dimension from "metabase-lib/lib/Dimension";

import { DimensionListItem } from "./DimensionListItem";

const mbql = ["field", ORDERS.TOTAL.id, null];
const dimension = Dimension.parseMBQL(mbql, metadata);
const dimensions = [dimension];

const setup = ({ tag, isSelected } = {}) => {
  return render(
    <DimensionListItem
      isSelected={isSelected}
      dimension={dimension}
      name="Total"
      iconName="int"
      tag={tag}
      dimensions={dimensions}
      onChangeDimension={() => {}}
      onAddDimension={() => {}}
      onRemoveDimension={() => {}}
      onSubDimensionChange={() => {}}
    />,
  );
};

describe("DimensionListItem", () => {
  it("renders title", () => {
    const { container } = setup();
    expect(container).toHaveTextContent("Total");
  });

  it("renders tag", () => {
    const { container } = setup({ tag: "custom" });
    expect(container).toHaveTextContent("custom");
  });

  it("renders remove button when selected", () => {
    const { queryByLabelText } = setup({ isSelected: true });
    expect(queryByLabelText("Add dimension")).toBeNull();
    expect(queryByLabelText("Remove dimension")).not.toBeNull();
  });

  it("renders add button when not selected", () => {
    const { queryByLabelText } = setup({ isSelected: false });
    expect(queryByLabelText("Remove dimension")).toBeNull();
    expect(queryByLabelText("Add dimension")).not.toBeNull();
  });
});
