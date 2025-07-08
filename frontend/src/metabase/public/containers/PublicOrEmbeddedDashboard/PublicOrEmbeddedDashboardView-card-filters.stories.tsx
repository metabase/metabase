import type { StoryContext, StoryFn } from "@storybook/react";
import { userEvent, within } from "@storybook/test";
import { HttpResponse, http } from "msw";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import { getNextId } from "__support__/utils";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { Api } from "metabase/api";
import { MetabaseReduxProvider } from "metabase/lib/redux/custom-context";
import {
  MockDashboardContext,
  type MockDashboardContextProps,
} from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import { publicReducers } from "metabase/reducers-public";
import { registerVisualization } from "metabase/visualizations";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import { Heading } from "metabase/visualizations/visualizations/Heading";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockHeadingDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";
import { PRODUCTS } from "metabase-types/api/mocks/presets";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { PublicOrEmbeddedDashboardView } from "./PublicOrEmbeddedDashboardView";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(BarChart);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Heading);

export default {
  title: "App/Embed/PublicOrEmbeddedDashboardView/card-filters",
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

function ReduxDecorator(Story: StoryFn, context: StoryContext) {
  const dashboard = context.args.dashboard as Dashboard;
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
      dashcardData: {
        [DASHCARD_BAR_ID]: {
          [CARD_BAR_ID]: createMockDataset({
            data: createMockDatasetData({
              cols: [
                createMockColumn(StringColumn({ name: "Dimension" })),
                createMockColumn(NumberColumn({ name: "Count" })),
              ],
              rows: [
                ["foo", 1],
                ["bar", 2],
              ],
            }),
          }),
        },
      },
    }),
  });

  const store = getStore(publicReducers, initialState, [Api.middleware]);
  return (
    <MetabaseReduxProvider store={store}>
      <Story />
    </MetabaseReduxProvider>
  );
}

const DASHBOARD_ID = getNextId();
const DASHCARD_HEADING_ID = getNextId();
const DASHCARD_BAR_ID = getNextId();
const CARD_BAR_ID = getNextId();
const TAB_ID = getNextId();

const CATEGORY_FILTER = createMockParameter({
  id: "category-hex",
  name: "Category",
  slug: "category",
});
const NUMBER_FILTER = createMockParameter({
  id: "number-hex",
  name: "Number Equals",
  sectionId: "number",
  slug: "number_equals",
  type: "number/=",
});
const DATE_FILTER = createMockParameter({
  id: "date-hex",
  name: "Date all options",
  sectionId: "date",
  slug: "date_all_options",
  type: "date/all-options",
});

interface CreateDashboardOpts {
  parameterIds: string[];
  headingText: string;
  headingWidth: number;
}

function createDashboard({
  parameterIds,
  headingText,
  headingWidth,
}: CreateDashboardOpts) {
  const parameters = [CATEGORY_FILTER, NUMBER_FILTER, DATE_FILTER].filter(
    (parameter) => parameterIds.includes(parameter.id),
  );

  return createMockDashboard({
    id: DASHBOARD_ID,
    name: "My dashboard",
    width: "full",
    parameters: parameters,
    dashcards: [
      createMockHeadingDashboardCard({
        id: DASHCARD_HEADING_ID,
        dashboard_tab_id: TAB_ID,
        text: headingText,
        inline_parameters: parameterIds,
        size_x: headingWidth,
        size_y: 1,
      }),
      createMockDashboardCard({
        id: DASHCARD_BAR_ID,
        dashboard_tab_id: TAB_ID,
        card: createMockCard({ id: CARD_BAR_ID, name: "Bar", display: "bar" }),
        size_x: 12,
        size_y: 8,
        row: 1,
        parameter_mappings: [
          {
            card_id: CARD_BAR_ID,
            parameter_id: CATEGORY_FILTER.id,
            target: [
              "dimension",
              ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
            ],
          },
          {
            card_id: CARD_BAR_ID,
            parameter_id: DATE_FILTER.id,
            target: [
              "dimension",
              ["field", PRODUCTS.CREATED_AT, { "base-type": "type/DateTime" }],
            ],
          },
          {
            card_id: CARD_BAR_ID,
            parameter_id: NUMBER_FILTER.id,
            target: [
              "dimension",
              ["field", PRODUCTS.RATING, { "base-type": "type/Float" }],
            ],
          },
        ],
      }),
    ],
  });
}

const Template: StoryFn<MockDashboardContextProps> = (args) => {
  const dashboard = args.dashboard;

  if (!dashboard) {
    return <>Please pass `dashboard`</>;
  }

  return (
    <MockDashboardContext {...args} dashboardId={dashboard.id}>
      <PublicOrEmbeddedDashboardView />
    </MockDashboardContext>
  );
};

type Args = MockDashboardContextProps & {
  dashboard: Dashboard;
};

const createArgs = ({
  dashboard,
  ...args
}: Omit<
  Args,
  "dashboardId" | "navigateToNewCardFromDashboard"
>): MockDashboardContextProps => {
  return {
    dashboard,
    dashboardId: dashboard.id,
    navigateToNewCardFromDashboard: null,
    titled: true,
    bordered: true,
    background: true,
    slowCards: {},
    selectedTabId: TAB_ID,
    ...args,
    downloadsEnabled: { pdf: true, results: false },
  };
};

export const FullWidthHeadingOneFilter = {
  render: Template,

  args: createArgs({
    dashboard: createDashboard({
      parameterIds: [CATEGORY_FILTER.id],
      headingText: "Heading",
      headingWidth: 24,
    }),
  }),
};

export const FullWidthHeadingManyFilters = {
  render: Template,

  args: createArgs({
    dashboard: createDashboard({
      parameterIds: [CATEGORY_FILTER.id, NUMBER_FILTER.id, DATE_FILTER.id],
      headingText: "Heading",
      headingWidth: 24,
    }),
  }),
};

export const NarrowHeadingOneFilter = {
  render: Template,

  args: createArgs({
    dashboard: createDashboard({
      parameterIds: [CATEGORY_FILTER.id],
      headingText: "Heading",
      headingWidth: 8,
    }),
  }),
};

export const NarrowHeadingManyFilters = {
  render: Template,

  args: createArgs({
    dashboard: createDashboard({
      parameterIds: [CATEGORY_FILTER.id, NUMBER_FILTER.id, DATE_FILTER.id],
      headingText: "Heading",
      headingWidth: 8,
    }),
  }),
};

export const NarrowHeadingManyFiltersExpanded = {
  render: Template,

  args: createArgs({
    dashboard: createDashboard({
      parameterIds: [CATEGORY_FILTER.id, NUMBER_FILTER.id, DATE_FILTER.id],
      headingText: "Heading",
      headingWidth: 8,
    }),
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const expandFiltersButton = await canvas.findByTestId(
      "show-filter-parameter-button",
    );
    await userEvent.click(expandFiltersButton);
  },
};

export const NarrowHeadingOneFilterLongText = {
  render: Template,

  args: createArgs({
    dashboard: createDashboard({
      parameterIds: [CATEGORY_FILTER.id],
      headingText: "Looooong Text",
      headingWidth: 8,
    }),
  }),
};
