import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, within } from "__support__/ui";
import { getNextId } from "__support__/utils";
import {
  createMockCard,
  createMockColumn,
  createMockDashboardOrderedCard,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import type { Props as AddSeriesModalProps } from "./AddSeriesModal";
import { AddSeriesModal } from "./AddSeriesModal";

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

const dashcard = createMockDashboardOrderedCard({
  id: getNextId(),
  card: baseCard,
  series: [firstCard, secondCard],
});

const dashcardData = {
  [dashcard.id]: {
    [baseCard.id]: dataset,
    [firstCard.id]: dataset,
    [secondCard.id]: dataset,
  },
};

const defaultProps = {
  dashcard,
  dashcardData,
  fetchCardData: jest.fn(),
  setDashCardAttributes: jest.fn(),
  onClose: jest.fn(),
};

const setup = (options?: Partial<AddSeriesModalProps>) => {
  return renderWithProviders(<AddSeriesModal {...defaultProps} {...options} />);
};

describe("AddSeriesModal", () => {
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

    userEvent.click(
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

    userEvent.click(
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

    userEvent.click(
      within(firstSeriesLegendItem).getByRole("img", { name: "close icon" }),
    );

    expect(getLegendLabels()).toEqual([baseCard.name, secondCard.name]);

    const secondSeriesLegendItem = screen.getAllByTestId("legend-item")[1];

    userEvent.click(
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
