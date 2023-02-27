import React from "react";
import { render, screen } from "@testing-library/react";

import { ChartSettingOrderedSimple } from "metabase/visualizations/components/settings/ChartSettingOrderedSimple";

const setup = props => {
  const value = [
    { name: "foo", enabled: true },
    { name: "bar", enabled: true },
    { name: "another", enabled: false },
  ];

  render(<ChartSettingOrderedSimple value={value} {...props} />);
};

describe("chartsettingorderedsimple", () => {
  it("should render all items", () => {
    setup();

    expect(screen.getByText("foo")).toBeVisible();
    expect(screen.getByText("bar")).toBeVisible();
    expect(screen.getByText("another")).toBeVisible();
  });

  it("hideDisabledItems", () => {
    setup({ hideOnDisabled: true });

    expect(screen.getByText("foo")).toBeVisible();
    expect(screen.getByText("bar")).toBeVisible();
    expect(screen.queryByText("another")).not.toBeVisible();
  });
});
