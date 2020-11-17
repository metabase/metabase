// we mock ExplicitSize in register-visualizations for all tests, we need to
// undo it just for this test
jest.unmock("metabase/components/ExplicitSize");

import React from "react";
import renderer from "react-test-renderer";
import { render } from "enzyme";
import { assocIn } from "icepick";

import DashCard, {
  WrappedVisualization,
} from "metabase/dashboard/components/DashCard";

jest.mock(WrappedVisualization);

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

// TODO: This test should be rewritten.
// It's testing logic in DashCard.render which should be extracted to a more testable place.
// I skipped it once DashCard required a connected redux store.
describe.skip("DashCard", () => {
  it("should render with no special classNames", () => {
    expect(
      renderer.create(<DashCard {...DEFAULT_PROPS} />).toJSON(),
    ).toMatchSnapshot();
  });
  it("should render slow card with Card--slow className", () => {
    const props = assocIn(DEFAULT_PROPS, ["slowCards", 1], true);
    const dashCard = render(<DashCard {...props} />);
    expect(dashCard.hasClass("Card--recent")).toBe(false);
    expect(dashCard.hasClass("Card--unmapped")).toBe(false);
    expect(dashCard.hasClass("Card--slow")).toBe(true);
  });
  it("should render new card with Card--recent className", () => {
    const props = assocIn(DEFAULT_PROPS, ["dashcard", "isAdded"], true);
    const dashCard = render(<DashCard {...props} />);
    expect(dashCard.hasClass("Card--recent")).toBe(true);
    expect(dashCard.hasClass("Card--unmapped")).toBe(false);
    expect(dashCard.hasClass("Card--slow")).toBe(false);
  });
});
