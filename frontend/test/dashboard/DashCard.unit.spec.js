import React from "react";
import renderer from "react-test-renderer";
import { render } from "enzyme";
import { assocIn } from "icepick";

import DashCard from "metabase/dashboard/components/DashCard";

jest.mock("metabase/visualizations/components/Visualization.jsx");

const DEFAULT_PROPS = {
  dashcard: {
    card: { id: 1 },
    series: [],
    parameter_mappings: [],
  },
  dashcardData: {
    1: { cols: [], rows: [] },
  },
  slowCards: {},
  parameterValues: {},
  markNewCardSeen: () => {},
  fetchCardData: () => {},
  dashboard: {
    parameters: [],
  },
};

describe("DashCard", () => {
  it("should render with no special classNames", () => {
    expect(
      renderer.create(<DashCard {...DEFAULT_PROPS} />).toJSON(),
    ).toMatchSnapshot();
  });
  it("should render slow card with Card--slow className", () => {
    const props = assocIn(DEFAULT_PROPS, ["slowCards", 1], true);
    const dashCard = render(<DashCard {...props} />);
    expect(dashCard.find(".Card--recent")).toHaveLength(0);
    expect(dashCard.find(".Card--unmapped")).toHaveLength(0);
    expect(dashCard.find(".Card--slow")).toHaveLength(1);
  });
  it("should render new card with Card--recent className", () => {
    const props = assocIn(DEFAULT_PROPS, ["dashcard", "isAdded"], true);
    const dashCard = render(<DashCard {...props} />);
    expect(dashCard.find(".Card--recent")).toHaveLength(1);
    expect(dashCard.find(".Card--unmapped")).toHaveLength(0);
    expect(dashCard.find(".Card--slow")).toHaveLength(0);
  });
});
