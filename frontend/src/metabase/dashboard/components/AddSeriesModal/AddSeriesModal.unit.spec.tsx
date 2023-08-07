import { renderWithProviders, screen } from "__support__/ui";

import {
  createMockCard,
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
  dataset: true,
});

const card2 = createMockCard({
  id: getNextId(),
  name: "Card 2",
});

const dashcard = createMockDashboardOrderedCard({
  card_id: card1.id,
  id: getNextId(),
  card: createMockCard({ id: getNextId(), name: "Base card" }),
  series: [card1, card2],
});

const dashcardData = {
  [dashcard.id]: {
    [dashcard.card.id]: createMockDataset({
      data: createMockDatasetData({
        rows: [["Davy Crocket"], ["Daniel Boone"]],
      }),
    }),
    [card1.id]: createMockDataset({
      data: createMockDatasetData({
        rows: [["Davy Crocket"], ["Daniel Boone"]],
      }),
    }),
    [card2.id]: createMockDataset({
      data: createMockDatasetData({
        rows: [["Davy Crocket"], ["Daniel Boone"]],
      }),
    }),
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
    // { storeInitialState: state },
  );
};

describe("AddSeriesModal", () => {
  it("renders anything", () => {
    setup();

    expect(screen.queryByText("Button properties")).not.toBeInTheDocument();
  });
});
