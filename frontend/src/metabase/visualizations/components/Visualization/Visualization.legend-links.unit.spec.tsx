import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen, within } from "__support__/ui";
import { delay } from "__support__/utils";
import VisualizationComponent from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import type { OnChangeCardAndRunOpts } from "metabase/visualizations/types";
import { loadVisualizationComponents } from "metabase/viz-core";
import type { RawSeries, SeriesCard } from "metabase-types/api";
import {
  createMockCard,
  createMockCategoryColumn,
  createMockDatasetData,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

registerVisualizations();

beforeAll(() => loadVisualizationComponents(["bar", "row"]));

const createBarSeries = (id: number, name: string) => ({
  card: createMockCard({ id, name, display: "bar" }),
  data: createMockDatasetData({
    cols: [
      createMockCategoryColumn({ id: 1, name: "Dimension" }),
      createMockNumericColumn({ id: 2, name: "Count" }),
    ],
    rows: [
      ["foo", 1],
      ["bar", 2],
    ],
  }),
});

interface SetupOpts {
  rawSeries: RawSeries;
}

const setup = async ({ rawSeries }: SetupOpts) => {
  const getCardHref = jest.fn(
    (nextCard: SeriesCard) => `/question/${nextCard.id}`,
  );
  const onChangeCardAndRun = jest.fn<void, [OnChangeCardAndRunOpts]>();

  renderWithProviders(
    <VisualizationComponent
      rawSeries={rawSeries}
      isDashboard
      showTitle
      getCardHref={getCardHref}
      onChangeCardAndRun={onChangeCardAndRun}
    />,
    { withRouter: true },
  );
  // ExplicitSize sets the chart dimensions on the tick after mounting.
  await delay(0);

  return { getCardHref, onChangeCardAndRun };
};

const getLegend = () => screen.getByLabelText("Legend");
const getLegendTitle = (name: string) => within(getLegend()).getByText(name);
const getLegendLink = (name: string) =>
  within(getLegend()).getByRole("link", { name });

describe("Visualization dashcard legend links (metabase#83401)", () => {
  it("should link each series to its own question, building the URL on hover", async () => {
    const { getCardHref } = await setup({
      rawSeries: [createBarSeries(1, "Card1"), createBarSeries(2, "Card2")],
    });

    expect(getLegendLink("Card2")).toHaveAttribute("href", "#");
    expect(getCardHref).not.toHaveBeenCalled();

    await userEvent.hover(getLegendTitle("Card2"));

    expect(getLegendLink("Card2")).toHaveAttribute("href", "/question/2");
  });

  it("should build the URL when a series link is focused", async () => {
    await setup({
      rawSeries: [createBarSeries(1, "Card1"), createBarSeries(2, "Card2")],
    });

    act(() => getLegendLink("Card2").focus());

    expect(getLegendLink("Card2")).toHaveFocus();
    expect(getLegendLink("Card2")).toHaveAttribute("href", "/question/2");
  });

  it("should open the question through onChangeCardAndRun when a series is clicked", async () => {
    const { onChangeCardAndRun } = await setup({
      rawSeries: [createBarSeries(1, "Card1"), createBarSeries(2, "Card2")],
    });

    await userEvent.click(getLegendTitle("Card2"));

    expect(onChangeCardAndRun).toHaveBeenCalledTimes(1);
    expect(onChangeCardAndRun).toHaveBeenCalledWith(
      expect.objectContaining({
        nextCard: expect.objectContaining({ id: 2 }),
      }),
    );
  });

  it("should link the series of a single row chart question to that question", async () => {
    await setup({
      rawSeries: [
        {
          card: createMockCard({ id: 3, name: "Card", display: "row" }),
          data: createMockDatasetData({
            cols: [
              createMockCategoryColumn({ name: "Dimension" }),
              createMockNumericColumn({ name: "count", display_name: "Count" }),
              createMockNumericColumn({ name: "sum", display_name: "Sum" }),
            ],
            rows: [
              ["foo", 1, 3],
              ["bar", 2, 4],
            ],
          }),
        },
      ],
    });

    await userEvent.hover(getLegendTitle("Sum"));

    expect(getLegendLink("Sum")).toHaveAttribute("href", "/question/3");
  });

  it("should not link breakout series, which open drills instead", async () => {
    await setup({
      rawSeries: [
        {
          card: createMockCard({ id: 1, name: "Card", display: "bar" }),
          data: createMockDatasetData({
            cols: [
              createMockCategoryColumn({ name: "Dimension1" }),
              createMockCategoryColumn({ name: "Dimension2" }),
              createMockNumericColumn({ name: "Count" }),
            ],
            rows: [
              ["foo", "a", 1],
              ["bar", "a", 2],
              ["baz", "b", 3],
            ],
          }),
        },
      ],
    });

    await userEvent.hover(getLegendTitle("a"));

    expect(within(getLegend()).queryByRole("link")).not.toBeInTheDocument();
  });
});
