import userEvent from "@testing-library/user-event";
import type { ComponentPropsWithoutRef } from "react";
import _ from "underscore";

import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { Card, Series } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockVisualizationSettings,
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

  renderWithProviders(
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

    const legendCaption = screen.getByTestId("legend-caption");

    expect(legendCaption).toBeInTheDocument();
    expect(legendCaption).toHaveTextContent("");
  });

  it("should ignore the first series' name to render the title", () => {
    setup({
      series: getSeries({ card: createMockCard({ name: "card name" }) }),
      settings: createMockVisualizationSettings({
        "card.description": "description",
      }),
    });

    const legendCaption = screen.getByTestId("legend-caption");

    expect(legendCaption).toBeInTheDocument();
    expect(legendCaption).toHaveTextContent("");
  });

  it("should use the settings card.title to render the title", () => {
    setup({
      series: getSeries({ card: createMockCard({ name: "card name" }) }),
      settings: createMockVisualizationSettings({
        "card.description": "description",
        "card.title": "Hello, is it me you're looking for",
      }),
    });

    const legendCaption = screen.getByTestId("legend-caption");

    expect(legendCaption).toBeInTheDocument();
    expect(legendCaption).toHaveTextContent(
      "Hello, is it me you're looking for",
    );
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
