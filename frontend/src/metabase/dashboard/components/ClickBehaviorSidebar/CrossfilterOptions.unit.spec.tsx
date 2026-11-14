import userEvent from "@testing-library/user-event";

import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { ClickBehavior } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockParameter,
} from "metabase-types/api/mocks";

import { CrossfilterOptions } from "./CrossfilterOptions";

const DASHBOARD_ID = 1;
const CARD_ID = 2;
const DASHCARD_ID = 3;

const PARAMETERS = [
  createMockParameter({ id: "id-1", name: "ID", slug: "id", type: "id" }),
  createMockParameter({ id: "id-2", name: "ID 1", slug: "id_1", type: "id" }),
  createMockParameter({
    id: "category-1",
    name: "Category",
    slug: "category",
    type: "category",
  }),
  createMockParameter({
    id: "category-2",
    name: "Category 1",
    slug: "category_1",
    type: "category",
  }),
];

const COUNT_COLUMN = createMockColumn({
  name: "COUNT(*)",
  display_name: "COUNT(*)",
  base_type: "type/BigInteger",
  effective_type: "type/BigInteger",
  source: "native",
});

function setup() {
  const dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    parameters: PARAMETERS,
  });
  const dashcard = createMockDashboardCard({
    id: DASHCARD_ID,
    dashboard_id: DASHBOARD_ID,
    card_id: CARD_ID,
    card: createMockCard({ id: CARD_ID }),
  });
  const clickBehavior: ClickBehavior = { type: "crossfilter" };

  renderWithProviders(
    <CrossfilterOptions
      dashboard={dashboard}
      dashcard={dashcard}
      clickBehavior={clickBehavior}
      updateSettings={jest.fn()}
    />,
    {
      storeInitialState: createMockState({
        dashboard: createMockDashboardState({
          dashboardId: DASHBOARD_ID,
          dashboards: {
            [DASHBOARD_ID]: createMockStoreDashboard({
              id: DASHBOARD_ID,
              parameters: PARAMETERS,
              dashcards: [DASHCARD_ID],
            }),
          },
          dashcards: { [DASHCARD_ID]: dashcard },
          dashcardData: {
            [DASHCARD_ID]: {
              [CARD_ID]: createMockDataset({
                data: createMockDatasetData({
                  cols: [COUNT_COLUMN],
                  rows: [[200]],
                }),
              }),
            },
          },
        }),
      }),
    },
  );
}

describe("CrossfilterOptions", () => {
  it.each(["ID", "Category"])(
    "offers only the card's columns as sources for the %s filter (metabase#14473)",
    async (filterName) => {
      setup();

      const filters = await screen.findByTestId("unset-click-mappings");
      await userEvent.click(
        within(filters).getByRole("button", { name: filterName }),
      );

      const listbox = await screen.findByRole("listbox");
      expect(within(listbox).getByText("Columns")).toBeInTheDocument();
      expect(within(listbox).getByText("COUNT(*)")).toBeInTheDocument();
      expect(
        within(listbox).queryByText("Dashboard filters"),
      ).not.toBeInTheDocument();
    },
  );
});
