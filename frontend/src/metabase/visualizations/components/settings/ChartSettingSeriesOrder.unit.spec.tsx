import type { ComponentProps } from "react";

import { render, screen } from "__support__/ui";

import { ChartSettingSeriesOrder } from "./ChartSettingSeriesOrder";

type Props = ComponentProps<typeof ChartSettingSeriesOrder>;

const setup = (props: Partial<Props> = {}) => {
  const defaultProps: Props = {
    onChange: jest.fn(),
    value: [],
    onShowWidget: jest.fn(),
    series: [],
    hasEditSettings: true,
    onChangeSeriesColor: jest.fn(),
    onSortEnd: jest.fn(),
  };

  render(<ChartSettingSeriesOrder {...defaultProps} {...props} />);
};

describe("ChartSettingSeriesOrder", () => {
  it("should render 'Nothing to order' when there are no series", () => {
    setup({ value: [] });

    expect(screen.getByText("Nothing to order")).toBeInTheDocument();
  });

  // metabase#49529: selecting a breakout dimension before a metric leaves the
  // widget with an undefined `value`. It must default to an empty list rather
  // than crashing while the sidebar renders.
  it("should render without crashing when the value is undefined (metabase#49529)", () => {
    setup({ value: undefined as unknown as Props["value"] });

    expect(screen.getByText("Nothing to order")).toBeInTheDocument();
  });
});
