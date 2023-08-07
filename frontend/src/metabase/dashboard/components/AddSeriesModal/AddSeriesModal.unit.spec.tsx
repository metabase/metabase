import { renderWithProviders, screen } from "__support__/ui";

import {
  createMockCard,
  createMockColumn,
  createMockDashboardOrderedCard,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { getNextId } from "__support__/utils";
import type { Props as AddSeriesModalProps } from "./AddSeriesModal";
import { AddSeriesModal } from "./AddSeriesModal";

const card1 = createMockCard({
  id: getNextId(),
  name: "Card 1",
});

const card2 = createMockCard({
  id: getNextId(),
  name: "Card 2",
});

const dataset = createMockDataset({
  data: createMockDatasetData({
    rows: [["Davy Crocket"], ["Daniel Boone"]],
    cols: [createMockColumn()],
  }),
});

const dashcard = createMockDashboardOrderedCard({
  id: getNextId(),
  card: createMockCard({
    id: getNextId(),
    name: "Base card",
  }),
  series: [card1, card2],
});

const dashcardData = {
  [dashcard.id]: {
    [dashcard.card.id]: dataset,
    [card1.id]: dataset,
    [card2.id]: dataset,
  },
};

const setup = (options?: Partial<AddSeriesModalProps>) => {
  renderWithProviders(
    <AddSeriesModal
      dashcard={dashcard}
      dashcardData={dashcardData}
      fetchCardData={jest.fn()}
      setDashCardAttributes={jest.fn()}
      onClose={jest.fn()}
      {...options}
    />,
  );
};

describe("AddSeriesModal", () => {
  it("renders anything", () => {
    setup();

    expect(screen.queryByText("Button properties")).not.toBeInTheDocument();
  });
});
