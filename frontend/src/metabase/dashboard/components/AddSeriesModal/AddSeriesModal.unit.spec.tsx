import { renderWithProviders, screen } from "__support__/ui";
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
    rows: [
      ["1958-04-01T00:00:00+07:00", 2],
      ["1958-05-01T00:00:00+07:00", 8],
      ["1958-06-01T00:00:00+07:00", 3],
      ["1958-07-01T00:00:00+07:00", 10],
    ],
    cols: [
      createMockColumn({
        base_type: "type/Date",
        display_name: "Birthday",
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
  card: createMockCard({
    id: getNextId(),
    name: "Base card",
    display: "bar",
  }),
  series: [card1, card2],
});

const dashcardData = {
  [dashcard.id]: {
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
