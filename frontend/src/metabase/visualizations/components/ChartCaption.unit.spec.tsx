import userEvent from "@testing-library/user-event";
import type { ComponentPropsWithoutRef } from "react";
import _ from "underscore";

import { render, screen, getIcon, queryIcon } from "__support__/ui";
import type { Card, Series } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
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
      ...createMockDataset({
        data: {
          rows: [["foo", 1]],
          cols,
          rows_truncated: 0,
        },
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
    width = 200,
  } = props;

  render(
    <ChartCaption
      series={series}
      onChangeCardAndRun={onChangeCardAndRun}
      settings={settings}
      width={width}
      {...props}
    />,
  );
};

describe("ChartCaption", () => {
  it("should render without a title (metabase#36788)", () => {
    setup();

    expect(screen.getByTestId("legend-caption")).toBeInTheDocument();
  });

  it("should render with a title", () => {
    setup({
      series: getSeries({ card: createMockCard({ name: "card name" }) }),
      settings: { "card.description": "description" },
    });

    expect(screen.getByTestId("legend-caption")).toBeInTheDocument();
  });

  it("should render markdown in description", async () => {
    setup({
      series: getSeries({ card: createMockCard({ name: "card name" }) }),
      settings: { "card.description": "[link](https://metabase.com)" },
    });

    await userEvent.hover(getIcon("info"));

    const tooltipContent = screen.getByRole("link");
    expect(tooltipContent).toBeInTheDocument();
    expect(tooltipContent).toHaveTextContent("link");
  });

  it("should hide description icon if too narrow", () => {
    setup({
      width: 50,
      series: getSeries({ card: createMockCard({ name: "card name" }) }),
      settings: { "card.description": "description" },
    });

    expect(queryIcon("info")).not.toBeInTheDocument();
  });
});
