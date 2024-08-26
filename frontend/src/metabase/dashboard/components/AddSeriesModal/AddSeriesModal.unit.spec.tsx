import userEvent from "@testing-library/user-event";

import { setupCardsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { getNextId } from "__support__/utils";
import registerVisualizations from "metabase/visualizations/register";
import {
  createMockCard,
  createMockColumn,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import type { Props as AddSeriesModalProps } from "./AddSeriesModal";
import { AddSeriesModal } from "./AddSeriesModal";

registerVisualizations();

const displayColumnName = "Birthday";

const baseCard = createMockCard({
  id: getNextId(),
  name: "Base card",
  display: "bar",
});

const firstCard = createMockCard({
  id: getNextId(),
  name: "First card",
  display: "bar",
});

const secondCard = createMockCard({
  id: getNextId(),
  name: "Second card",
  display: "bar",
});

const incompleteCard = createMockCard({
  id: getNextId(),
  name: "Incomplete card",
  display: "bar",
  visualization_settings: {
    "graph.dimensions": [],
    "graph.metrics": [],
  },
});

const dataset = createMockDataset({
  data: createMockDatasetData({
    rows: [
      ["1958-04-01T00:00:00+07:00", 2],
      ["1958-05-01T00:00:00+07:00", 8],
      ["1958-06-01T00:00:00+07:00", 3],
      ["1958-07-01T00:00:00+07:00", 10],
    ],
    cols: [
      createMockColumn({
        base_type: "type/Date",
        display_name: displayColumnName,
      }),
      createMockColumn({
        base_type: "type/BigInteger",
        display_name: "Count",
      }),
    ],
  }),
});

const dashcard = createMockDashboardCard({
  id: getNextId(),
  card: baseCard,
  series: [firstCard, secondCard, incompleteCard],
});

const incompleteDashcard = createMockDashboardCard({
  id: getNextId(),
  card: baseCard,
  series: [incompleteCard],
});

const defaultProps = {
  dashcard,
  dashcardData: {
    [dashcard.id]: {
      [baseCard.id]: dataset,
      [firstCard.id]: dataset,
      [secondCard.id]: dataset,
    },
  },
  fetchCardData: jest.fn(),
  setDashCardAttributes: jest.fn(),
  onClose: jest.fn(),
};

const setup = (options?: Partial<AddSeriesModalProps>) => {
  setupCardsEndpoints([baseCard, firstCard, secondCard]);
  return renderWithProviders(<AddSeriesModal {...defaultProps} {...options} />);
};

describe("AddSeriesModal", () => {
  it("shows chart settings error message for incomplete charts", () => {
    setup({
      dashcard: incompleteDashcard,
      dashcardData: {
        [incompleteDashcard.id]: {
          [incompleteCard.id]: dataset,
        },
      },
    });

    expect(
      screen.getByText("Which fields do you want to use for the X and Y axes?"),
    ).toBeInTheDocument();
  });

  it("shows the 'x' button in all legend items in visualization legend except for the base series", () => {
    setup();

    const [baseSeriesLegendItem, ...legendItems] =
      screen.getAllByTestId("legend-item");

    expect(
      within(baseSeriesLegendItem).queryByRole("img", { name: "close icon" }),
    ).not.toBeInTheDocument();

    expect(legendItems.length).toBe(2);

    for (const legendItem of legendItems) {
      expect(
        within(legendItem).getByRole("img", { name: "close icon" }),
      ).toBeInTheDocument();
    }
  });

  it("can remove first series by clicking the 'x' button in visualization legend items (metabase#12794)", async () => {
    setup();

    expect(getLegendLabels()).toEqual([
      baseCard.name,
      firstCard.name,
      secondCard.name,
    ]);

    const firstSeriesLegendItem = screen.getAllByTestId("legend-item")[1];

    await userEvent.click(
      within(firstSeriesLegendItem).getByRole("img", { name: "close icon" }),
    );

    expect(getLegendLabels()).toEqual([baseCard.name, secondCard.name]);
  });

  it("can remove second series by clicking the 'x' button in visualization legend items (metabase#12794)", async () => {
    setup();

    expect(getLegendLabels()).toEqual([
      baseCard.name,
      firstCard.name,
      secondCard.name,
    ]);

    const secondSeriesLegendItem = screen.getAllByTestId("legend-item")[2];

    await userEvent.click(
      within(secondSeriesLegendItem).getByRole("img", { name: "close icon" }),
    );

    expect(getLegendLabels()).toEqual([baseCard.name, firstCard.name]);
  });

  it("can remove all series by clicking the 'x' button in visualization legend items (metabase#12794)", async () => {
    setup();

    expect(getLegendLabels()).toEqual([
      baseCard.name,
      firstCard.name,
      secondCard.name,
    ]);

    const firstSeriesLegendItem = screen.getAllByTestId("legend-item")[1];

    await userEvent.click(
      within(firstSeriesLegendItem).getByRole("img", { name: "close icon" }),
    );

    expect(getLegendLabels()).toEqual([baseCard.name, secondCard.name]);

    const secondSeriesLegendItem = screen.getAllByTestId("legend-item")[1];

    await userEvent.click(
      within(secondSeriesLegendItem).getByRole("img", { name: "close icon" }),
    );

    expect(getLegendLabels()).toEqual([displayColumnName]);
  });
});

function getLegendLabels() {
  return screen
    .getAllByTestId("legend-item")
    .map(element => element.textContent);
}
