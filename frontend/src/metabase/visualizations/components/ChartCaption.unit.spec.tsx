import React, { ComponentPropsWithoutRef } from "react";
import _ from "underscore";
import userEvent from "@testing-library/user-event";
import { render, screen, getIcon } from "__support__/ui";

import { Card, Series } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import ChartCaption from "./ChartCaption";

type Props = ComponentPropsWithoutRef<typeof ChartCaption>;

const getSeries = ({ card }: { card?: Card } = {}): Series => {
  const cols = [
    createMockColumn({
      name: "col 1",
      display_name: "col 1",
      source: "source",
    }),
    createMockColumn({
      name: "col 2",
      display_name: "col 2",
      source: "source",
    }),
  ];
  const series: Series = [
    {
      card: card ?? createMockCard({ name: "" }),
      data: createMockDatasetData({
        cols,
        rows: [["foo", 1]],
        rows_truncated: 0,
      }),
    },
  ];

  return series;
};

const setup = (props: Partial<Props> = {}) => {
  const {
    series = getSeries(),
    onChangeCardAndRun = _.noop,
    settings = {},
  } = props;

  render(
    <ChartCaption
      series={series}
      onChangeCardAndRun={onChangeCardAndRun}
      settings={settings}
      {...props}
    />,
  );
};

describe("ChartCaption", () => {
  it("shouldn't render without title", () => {
    setup();

    expect(screen.queryByTestId("legend-caption")).not.toBeInTheDocument();
  });

  it("should render with title", () => {
    setup({
      series: getSeries({ card: createMockCard({ name: "card name" }) }),
      settings: { "card.description": "description" },
    });

    expect(screen.getByTestId("legend-caption")).toBeInTheDocument();
  });

  it("should render markdown in description", () => {
    setup({
      series: getSeries({ card: createMockCard({ name: "card name" }) }),
      settings: { "card.description": "[link](https://metabase.com)" },
    });

    userEvent.hover(getIcon("info"));

    const tooltipContent = screen.getByRole("link");
    expect(tooltipContent).toBeInTheDocument();
    expect(tooltipContent).toHaveTextContent("link");
  });
});
