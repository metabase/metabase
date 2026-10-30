import type { StoryContext, StoryFn } from "@storybook/react";
import { screen, userEvent, within } from "@storybook/test";
import { HttpResponse, http } from "msw";
import type { ComponentType } from "react";
import _ from "underscore";

import { getPublicStore } from "__support__/entities-store";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockState,
} from "__support__/state";
import { getNextId } from "__support__/utils";
import { DateTimeColumn, NumberColumn } from "__support__/visualizations";
import {
  MockDashboardContext,
  type MockDashboardContextProps,
} from "metabase/dashboard/context/mock-context";
import { MetabaseReduxProvider } from "metabase/redux";
import { Scalar } from "metabase/visualizations/visualizations/Scalar/Scalar";
import { SmartScalar } from "metabase/visualizations/visualizations/SmartScalar/SmartScalar";
import { registerVisualization } from "metabase/viz-core";
import type {
  CardDisplayType,
  DashCardDataMap,
  Dashboard,
  DashboardCard,
  Parameter,
  ParameterValuesMap,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockInsight,
  createMockParameter,
} from "metabase-types/api/mocks";
import { PRODUCTS } from "metabase-types/api/mocks/presets";

import { PublicOrEmbeddedDashboardView } from "./PublicOrEmbeddedDashboardView";

registerVisualization(Scalar);
registerVisualization(SmartScalar);

export default {
  title: "App/Embed/PublicOrEmbeddedDashboardView/scalar-card-filters",
  component: PublicOrEmbeddedDashboardView,
  decorators: [ReduxDecorator],
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        http.get("*/api/database", () =>
          HttpResponse.json(createMockDatabase()),
        ),
      ],
    },
  },
};

type Args = MockDashboardContextProps & {
  dashboard: Dashboard;
  dashcardData: DashCardDataMap;
  parameterValues: ParameterValuesMap;
};

function ReduxDecorator(Story: ComponentType, context: StoryContext) {
  // Unjustified type cast. FIXME
  const { dashboard, dashcardData, parameterValues } = context.args as Args;
  const initialState = createMockState({
    settings: createMockSettingsState({
      "hide-embed-branding?": false,
    }),
    dashboard: createMockDashboardState({
      dashboardId: dashboard.id,
      dashboards: {
        [dashboard.id]: {
          ...dashboard,
          dashcards: dashboard.dashcards.map((dashcard) => dashcard.id),
        },
      },
      dashcards: _.indexBy(dashboard.dashcards, "id"),
      dashcardData,
      parameterValues,
    }),
  });

  const store = getPublicStore(initialState);
  return (
    <MetabaseReduxProvider store={store}>
      <Story />
    </MetabaseReduxProvider>
  );
}

const DASHBOARD_ID = getNextId();
const TAB_ID = getNextId();

const NUMBER_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [createMockColumn(NumberColumn({ name: "Count" }))],
    rows: [[18760]],
  }),
});

const TREND_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [
      createMockColumn(DateTimeColumn({ name: "Created At", unit: "month" })),
      createMockColumn(NumberColumn({ name: "Count" })),
    ],
    rows: [
      ["2019-10-01T00:00:00", 100],
      ["2019-11-01T00:00:00", 120],
    ],
    insights: [createMockInsight({ unit: "month", col: "Count" })],
  }),
});

interface CardSpec {
  display: Extract<CardDisplayType, "scalar" | "smartscalar">;
  col: number;
  row?: number;
  size_x: number;
  size_y: number;
  /** One entry per card-level filter; `null` leaves the filter without a value. */
  filterValues: (string | null)[];
  name?: string;
}

interface StoryDashboard {
  dashboard: Dashboard;
  dashcardData: DashCardDataMap;
  parameterValues: ParameterValuesMap;
}

const CARD_NAMES = {
  scalar: "Sum of Total",
  smartscalar: "Sum of Total by month",
};
const FILTER_NAMES = ["Category", "Vendor", "Source"];

function createStoryDashboard(cards: CardSpec[]): StoryDashboard {
  const parameters: Parameter[] = [];
  const parameterValues: ParameterValuesMap = {};
  const dashcardData: DashCardDataMap = {};

  const dashcards: DashboardCard[] = cards.map((spec, cardIndex) => {
    const cardId = getNextId();
    const dashcardId = getNextId();
    const cardParameters = spec.filterValues.map((value, index) => {
      const parameter = createMockParameter({
        id: `card-${cardIndex}-filter-${index}`,
        name: FILTER_NAMES[index],
        slug: `card_${cardIndex}_filter_${index}`,
        type: "string/=",
      });
      parameters.push(parameter);
      parameterValues[parameter.id] = value == null ? null : [value];
      return parameter;
    });

    dashcardData[dashcardId] = {
      [cardId]: spec.display === "scalar" ? NUMBER_DATASET : TREND_DATASET,
    };

    return createMockDashboardCard({
      id: dashcardId,
      dashboard_tab_id: TAB_ID,
      card: createMockCard({
        id: cardId,
        name: spec.name ?? CARD_NAMES[spec.display],
        display: spec.display,
      }),
      inline_parameters: cardParameters.map((parameter) => parameter.id),
      row: spec.row ?? 0,
      col: spec.col,
      size_x: spec.size_x,
      size_y: spec.size_y,
      parameter_mappings: cardParameters.map((parameter) => ({
        card_id: cardId,
        parameter_id: parameter.id,
        target: [
          "dimension",
          ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        ],
      })),
    });
  });

  return {
    dashboard: createMockDashboard({
      id: DASHBOARD_ID,
      name: "Card-level filters",
      width: "fixed",
      parameters,
      dashcards,
    }),
    dashcardData,
    parameterValues,
  };
}

const Template: StoryFn<Args> = ({ dashboard, ...args }) => (
  <MockDashboardContext
    {...args}
    dashboard={dashboard}
    dashboardId={dashboard.id}
  >
    <PublicOrEmbeddedDashboardView />
  </MockDashboardContext>
);

const createArgs = (storyDashboard: StoryDashboard): Args => ({
  ...storyDashboard,
  dashboardId: storyDashboard.dashboard.id,
  navigateToNewCardFromDashboard: null,
  titled: true,
  bordered: true,
  background: true,
  slowCards: {},
  selectedTabId: TAB_ID,
  downloadsEnabled: { pdf: true, results: false },
});

// Number cards: an applied filter, an empty filter, two applied filters, and the
// smallest sizes with a filter.
export const NumberCards = {
  render: Template,
  args: createArgs(
    createStoryDashboard([
      {
        display: "scalar",
        col: 0,
        size_x: 5,
        size_y: 2,
        filterValues: ["Gadget"],
      },
      { display: "scalar", col: 5, size_x: 5, size_y: 2, filterValues: [null] },
      {
        display: "scalar",
        col: 10,
        size_x: 6,
        size_y: 3,
        filterValues: ["Gadget", "Acme"],
      },
      {
        display: "scalar",
        col: 16,
        size_x: 2,
        size_y: 2,
        filterValues: ["Gadget"],
      },
      {
        display: "scalar",
        col: 18,
        size_x: 3,
        size_y: 2,
        filterValues: ["Gadget"],
      },
      {
        display: "scalar",
        col: 21,
        size_x: 3,
        size_y: 2,
        filterValues: [null],
      },
    ]),
  ),
};

// Trend cards: the pill shares the top edge with the trend symbol and comparison.
export const TrendCards = {
  render: Template,
  args: createArgs(
    createStoryDashboard([
      {
        display: "smartscalar",
        col: 0,
        size_x: 6,
        size_y: 3,
        filterValues: ["Gadget"],
      },
      {
        display: "smartscalar",
        col: 6,
        size_x: 6,
        size_y: 3,
        filterValues: ["Gadget", null],
      },
      {
        display: "smartscalar",
        col: 12,
        size_x: 2,
        size_y: 2,
        filterValues: ["Gadget"],
      },
      {
        display: "smartscalar",
        col: 14,
        size_x: 3,
        size_y: 2,
        filterValues: ["Gadget"],
      },
      {
        display: "smartscalar",
        col: 17,
        size_x: 4,
        size_y: 2,
        filterValues: [null],
      },
      {
        display: "smartscalar",
        col: 21,
        size_x: 3,
        size_y: 3,
        filterValues: [null, null],
      },
    ]),
  ),
};

// Clicking the pill lists the card's filters.
export const NumberCardFilterListExpanded = {
  render: Template,
  args: createArgs(
    createStoryDashboard([
      {
        display: "scalar",
        col: 0,
        size_x: 6,
        size_y: 3,
        filterValues: ["Gadget", null, "Email"],
      },
    ]),
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByTestId("show-filter-parameter-button"),
    );
    await screen.findByRole("menuitem", { name: /Vendor/ });
  },
};

// Picking a filter swaps the list for that filter's widget, with a way back.
export const NumberCardFilterWidgetExpanded = {
  render: Template,
  args: createArgs(
    createStoryDashboard([
      {
        display: "scalar",
        col: 0,
        size_x: 6,
        size_y: 3,
        filterValues: ["Gadget", null],
      },
    ]),
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByTestId("show-filter-parameter-button"),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Vendor/ }),
    );
    await screen.findByPlaceholderText("Enter some text");
  },
};
