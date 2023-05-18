import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockMetadata } from "__support__/metadata";

import { createSampleDatabase, ORDERS } from "metabase-types/api/mocks/presets";
import Dimension from "metabase-lib/Dimension";

import { DimensionListItem } from "./DimensionListItem";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const mbql = ["field", ORDERS.TOTAL, null];
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
    setup({ isSelected: true });
    expect(screen.queryByLabelText("Add dimension")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Remove dimension")).toBeInTheDocument();
  });

  it("renders add button when not selected", () => {
    setup({ isSelected: false });
    expect(screen.queryByLabelText("Remove dimension")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Add dimension")).toBeInTheDocument();
  });
});
