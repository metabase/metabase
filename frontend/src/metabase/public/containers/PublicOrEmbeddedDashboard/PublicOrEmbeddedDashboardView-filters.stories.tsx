// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { ComponentStory, Story, StoryContext } from "@storybook/react";
import { within, userEvent } from "@storybook/testing-library";
import { useEffect, type ComponentProps } from "react";
import { Provider } from "react-redux";

import { getStore } from "__support__/entities-store";
import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { waitTimeContext } from "metabase/context/wait-time";
import { getDashboardUiParameters } from "metabase/parameters/utils/dashboards";
import { publicReducers } from "metabase/reducers-public";
import TABLE_RAW_SERIES from "metabase/visualizations/components/TableSimple/stories-data/table-simple-orders-with-people.json";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockParameter,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { PublicOrEmbeddedDashboardView } from "./PublicOrEmbeddedDashboardView";

export default {
  title: "embed/PublicOrEmbeddedDashboardView/filters",
  component: PublicOrEmbeddedDashboardView,
  decorators: [
    ReduxDecorator,
    FasterExplicitSizeUpdateDecorator,
    WaitForResizeToStopDecorator,
    MockIsEmbeddingDecorator,
  ],
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    parameterType: {
      options: ["text", "dropdown"],
      control: { type: "select" },
    },
  },
};

function ReduxDecorator(Story: Story, context: StoryContext) {
  const parameterType: ParameterType = context.args.parameterType;
  const initialState = createMockState({
    settings: createMockSettingsState({
      "hide-embed-branding?": false,
    }),
    dashboard: createMockDashboardState({
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
        [DASHCARD_TABLE_ID]: {
          // Couldn't really figure out the type here.
          [CARD_TABLE_ID]: createMockDataset(TABLE_RAW_SERIES[0] as any),
        },
      },
    }),
    parameters: {
      parameterValuesCache: {
        [`{"paramId":"${CATEGORY_FILTER.id}","dashId":${DASHBOARD_ID}}`]: {
          values: [["Doohickey"], ["Gadget"], ["Gizmo"], ["Widget"]],
          has_more_values: parameterType === "search" ? true : false,
        },
        [`{"paramId":"${CATEGORY_FILTER.id}","dashId":${DASHBOARD_ID},"query":"g"}`]:
          {
            values: [["Gadget"], ["Gizmo"], ["Widget"]],
            has_more_values: parameterType === "search" ? true : false,
          },
      },
    },
  });

  const store = getStore(publicReducers, initialState);
  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
}

function FasterExplicitSizeUpdateDecorator(Story: Story) {
  return (
    <waitTimeContext.Provider value={0}>
      <Story />
    </waitTimeContext.Provider>
  );
}

/**
 * This is an arbitrary number, it should be big enough to pass CI tests.
 * This value works together with FasterExplicitSizeUpdateDecorator which
 * make sure we finish resizing any ExplicitSize components the fastest.
 */
const TIME_UNTIL_ALL_ELEMENTS_STOP_RESIZING = 1000;
function WaitForResizeToStopDecorator(Story: Story) {
  const asyncCallback = createAsyncCallback();
  useEffect(() => {
    setTimeout(asyncCallback, TIME_UNTIL_ALL_ELEMENTS_STOP_RESIZING);
  }, [asyncCallback]);

  return <Story />;
}

declare global {
  interface Window {
    overrideIsWithinIframe?: boolean;
  }
}
function MockIsEmbeddingDecorator(Story: Story) {
  window.overrideIsWithinIframe = true;
  return <Story />;
}

const DASHBOARD_ID = getNextId();
const DASHCARD_BAR_ID = getNextId();
const DASHCARD_TABLE_ID = getNextId();
const CARD_BAR_ID = getNextId();
const CARD_TABLE_ID = getNextId();
const TAB_ID = getNextId();
const CATEGORY_FILTER = createMockParameter({
  id: "category-hex",
  name: "Category",
  slug: "category",
});
const DATE_FILTER_ID = "date-hex";

interface CreateDashboardOpts {
  hasScroll?: boolean;
}
function createDashboard({ hasScroll }: CreateDashboardOpts = {}) {
  return createMockDashboard({
    id: DASHBOARD_ID,
    name: "My dashboard",
    width: "full",
    dashcards: [
      createMockDashboardCard({
        id: DASHCARD_BAR_ID,
        dashboard_tab_id: TAB_ID,
        card: createMockCard({ id: CARD_BAR_ID, name: "Bar", display: "bar" }),
        size_x: 12,
        size_y: 8,
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
            parameter_id: DATE_FILTER_ID,
            target: [
              "dimension",
              ["field", PRODUCTS.CREATED_AT, { "base-type": "type/DateTime" }],
            ],
          },
        ],
      }),
      createMockDashboardCard({
        id: DASHCARD_TABLE_ID,
        dashboard_tab_id: TAB_ID,
        card: createMockCard({
          id: CARD_TABLE_ID,
          name: "Table",
          display: "table",
        }),
        ...(!hasScroll ? { col: 12 } : { row: 8 }),
        size_x: 12,
        size_y: 8,
      }),
    ],
  });
}

const Template: ComponentStory<typeof PublicOrEmbeddedDashboardView> = args => {
  // @ts-expect-error -- custom prop to support non JSON-serializable value as args
  const parameterType: ParameterType = args.parameterType;
  const dashboard = args.dashboard;
  if (!dashboard) {
    return <>Please pass `dashboard`</>;
  }

  const PARAMETER_MAPPING: Record<ParameterType, UiParameter[]> = {
    text: getDashboardUiParameters(
      dashboard.dashcards,
      [CATEGORY_FILTER],
      createMockMetadata({}),
      {},
    ),
    dropdown: getDashboardUiParameters(
      dashboard.dashcards,
      [CATEGORY_FILTER],
      createMockMetadata({
        databases: [createSampleDatabase()],
      }),
      {},
    ),
    search: getDashboardUiParameters(
      dashboard.dashcards,
      [CATEGORY_FILTER],
      createMockMetadata({
        databases: [createSampleDatabase()],
      }),
      {},
    ),
    date_all_options: getDashboardUiParameters(
      dashboard.dashcards,
      [
        createMockParameter({
          id: DATE_FILTER_ID,
          name: "Date all options",
          sectionId: "date",
          slug: "date_all_options",
          type: "date/all-options",
        }),
      ],
      createMockMetadata({}),
      {},
    ),
    date_month_year: getDashboardUiParameters(
      dashboard.dashcards,
      [
        createMockParameter({
          id: DATE_FILTER_ID,
          name: "Date Month and Year",
          sectionId: "date",
          slug: "date_month_and_year",
          type: "date/month-year",
        }),
      ],
      createMockMetadata({}),
      {},
    ),
    date_quarter_year: getDashboardUiParameters(
      dashboard.dashcards,
      [
        createMockParameter({
          id: DATE_FILTER_ID,
          name: "Date Quarter and Year",
          sectionId: "date",
          slug: "date_quarter_and_year",
          type: "date/quarter-year",
        }),
      ],
      createMockMetadata({}),
      {},
    ),
    date_single: getDashboardUiParameters(
      dashboard.dashcards,
      [
        createMockParameter({
          id: DATE_FILTER_ID,
          name: "Date single",
          sectionId: "date",
          slug: "date_single",
          type: "date/single",
        }),
      ],
      createMockMetadata({}),
      {},
    ),
    date_range: getDashboardUiParameters(
      dashboard.dashcards,
      [
        createMockParameter({
          id: DATE_FILTER_ID,
          name: "Date range",
          sectionId: "date",
          slug: "date_range",
          type: "date/range",
        }),
      ],
      createMockMetadata({}),
      {},
    ),
    date_relative: getDashboardUiParameters(
      dashboard.dashcards,
      [
        createMockParameter({
          id: DATE_FILTER_ID,
          name: "Date relative",
          sectionId: "date",
          slug: "date_relative",
          type: "date/relative",
        }),
      ],
      createMockMetadata({}),
      {},
    ),
  };
  return (
    <PublicOrEmbeddedDashboardView
      {...args}
      parameters={PARAMETER_MAPPING[parameterType]}
    />
  );
};

type ArgType = Partial<ComponentProps<typeof PublicOrEmbeddedDashboardView>>;

type ParameterType =
  | "text"
  | "dropdown"
  | "search"
  | "date_all_options"
  | "date_month_year"
  | "date_quarter_year"
  | "date_single"
  | "date_range"
  | "date_relative";

const createDefaultArgs = (
  args: ArgType & { parameterType?: ParameterType } = {},
): ArgType & { parameterType: ParameterType } => {
  const dashboard = createDashboard();
  return {
    dashboard,
    titled: true,
    bordered: true,
    background: true,
    slowCards: {},
    selectedTabId: TAB_ID,
    parameterType: "text",
    ...args,
  };
};

function getLastPopover() {
  const lastPopover = Array.from(
    document.documentElement.querySelectorAll(
      '[data-element-id="mantine-popover"]',
    ),
  ).at(-1) as HTMLElement;

  return within(lastPopover);
}

// Light theme
export const LightThemeText = Template.bind({});
LightThemeText.args = createDefaultArgs();
LightThemeText.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);
};

export const LightThemeTextWithValue = Template.bind({});
LightThemeTextWithValue.args = createDefaultArgs();
LightThemeTextWithValue.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);

  const documentElement = within(document.documentElement);
  await userEvent.type(
    documentElement.getByPlaceholderText("Enter some text"),
    "filter value",
  );
  await userEvent.tab();
};

export const LightThemeParameterList = Template.bind({});
LightThemeParameterList.args = createDefaultArgs({
  parameterType: "dropdown",
});
LightThemeParameterList.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);
};

export const LightThemeParameterListWithValue = Template.bind({});
LightThemeParameterListWithValue.args = createDefaultArgs({
  parameterType: "dropdown",
});
LightThemeParameterListWithValue.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);

  const documentElement = within(document.documentElement);
  await userEvent.type(
    documentElement.getByPlaceholderText("Search the list"),
    "g",
  );
  await userEvent.click(documentElement.getByText("Widget"));
};

export const LightThemeParameterSearch = Template.bind({});
LightThemeParameterSearch.args = createDefaultArgs({
  parameterType: "search",
});
LightThemeParameterSearch.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);
};

export const LightThemeParameterSearchWithValue = Template.bind({});
LightThemeParameterSearchWithValue.args = createDefaultArgs({
  parameterType: "search",
});
LightThemeParameterSearchWithValue.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);

  const documentElement = within(document.documentElement);
  const searchInput = documentElement.getByPlaceholderText("Search the list");
  await userEvent.click(documentElement.getByText("Widget"));
  await userEvent.type(searchInput, "g");

  const dropdown = getLastPopover();
  (dropdown.getByText("Gadget").parentNode as HTMLElement).setAttribute(
    "data-hovered",
    "true",
  );
};

// Dark theme
export const DarkThemeText = Template.bind({});
DarkThemeText.args = createDefaultArgs({ theme: "night" });
DarkThemeText.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);
};

export const DarkThemeTextWithValue = Template.bind({});
DarkThemeTextWithValue.args = createDefaultArgs({ theme: "night" });
DarkThemeTextWithValue.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);

  const documentElement = within(document.documentElement);
  await userEvent.type(
    documentElement.getByPlaceholderText("Enter some text"),
    "filter value",
  );
  await userEvent.tab();
};

export const DarkThemeParameterList = Template.bind({});
DarkThemeParameterList.args = createDefaultArgs({
  theme: "night",
  parameterType: "dropdown",
});
DarkThemeParameterList.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);
};

export const DarkThemeParameterListWithValue = Template.bind({});
DarkThemeParameterListWithValue.args = createDefaultArgs({
  theme: "night",
  parameterType: "dropdown",
});
DarkThemeParameterListWithValue.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);

  const documentElement = within(document.documentElement);
  await userEvent.type(
    documentElement.getByPlaceholderText("Search the list"),
    "g",
  );
  await userEvent.click(documentElement.getByText("Widget"));
};

export const DarkThemeParameterSearch = Template.bind({});
DarkThemeParameterSearch.args = createDefaultArgs({
  theme: "night",
  parameterType: "search",
});
DarkThemeParameterSearch.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);
};

export const DarkThemeParameterSearchWithValue = Template.bind({});
DarkThemeParameterSearchWithValue.args = createDefaultArgs({
  theme: "night",
  parameterType: "search",
});
DarkThemeParameterSearchWithValue.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", { name: "Category" });
  await userEvent.click(filter);

  const documentElement = within(document.documentElement);
  const searchInput = documentElement.getByPlaceholderText("Search the list");
  await userEvent.click(documentElement.getByText("Widget"));
  await userEvent.type(searchInput, "g");

  const dropdown = getLastPopover();
  (dropdown.getByText("Gadget").parentNode as HTMLElement).setAttribute(
    "data-hovered",
    "true",
  );
};

// Date filters

// All options
export const LightThemeDateFilterAllOptions = Template.bind({});
LightThemeDateFilterAllOptions.args = createDefaultArgs({
  parameterType: "date_all_options",
});
LightThemeDateFilterAllOptions.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date all options",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();
  const today = popover.getByRole("button", { name: "Today" });
  today.classList.add("pseudo-hover");
};

export const DarkThemeDateFilterAllOptions = Template.bind({});
DarkThemeDateFilterAllOptions.args = createDefaultArgs({
  theme: "night",
  parameterType: "date_all_options",
});
DarkThemeDateFilterAllOptions.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date all options",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();
  const today = popover.getByRole("button", { name: "Today" });
  today.classList.add("pseudo-hover");
};

// Month and Year
export const LightThemeDateFilterMonthYear = Template.bind({});
LightThemeDateFilterMonthYear.args = createDefaultArgs({
  parameterType: "date_month_year",
  parameterValues: {
    [DATE_FILTER_ID]: "2024-01",
  },
});
LightThemeDateFilterMonthYear.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date Month and Year",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();
  const month = popover.getByText("March");
  month.classList.add("pseudo-hover");

  await userEvent.click(
    popover.getAllByDisplayValue("2024").at(-1) as HTMLElement,
  );
  const dropdown = getLastPopover();
  dropdown
    .getByRole("option", { name: "2023" })
    .setAttribute("data-hovered", "true");
};

export const DarkThemeDateFilterMonthYear = Template.bind({});
DarkThemeDateFilterMonthYear.args = createDefaultArgs({
  theme: "night",
  parameterType: "date_month_year",
  parameterValues: {
    [DATE_FILTER_ID]: "2024-01",
  },
});
DarkThemeDateFilterMonthYear.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date Month and Year",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();
  const month = popover.getByText("March");
  month.classList.add("pseudo-hover");

  await userEvent.click(
    popover.getAllByDisplayValue("2024").at(-1) as HTMLElement,
  );
  const dropdown = getLastPopover();
  dropdown
    .getByRole("option", { name: "2023" })
    .setAttribute("data-hovered", "true");
};

// Quarter and Year
export const LightThemeDateFilterQuarterYear = Template.bind({});
LightThemeDateFilterQuarterYear.args = createDefaultArgs({
  parameterType: "date_quarter_year",
  parameterValues: {
    [DATE_FILTER_ID]: "Q1-2024",
  },
});
LightThemeDateFilterQuarterYear.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date Quarter and Year",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();
  const month = popover.getByText("Q2");
  month.classList.add("pseudo-hover");
};

export const LightThemeDateFilterQuarterYearDropdown = Template.bind({});
LightThemeDateFilterQuarterYearDropdown.args = createDefaultArgs({
  parameterType: "date_quarter_year",
  parameterValues: {
    [DATE_FILTER_ID]: "Q1-2024",
  },
});
LightThemeDateFilterQuarterYearDropdown.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date Quarter and Year",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();

  await userEvent.click(
    popover.getAllByDisplayValue("2024").at(-1) as HTMLElement,
  );
  const dropdown = getLastPopover();
  dropdown
    .getByRole("option", { name: "2023" })
    .setAttribute("data-hovered", "true");
};

export const DarkThemeDateFilterQuarterYear = Template.bind({});
DarkThemeDateFilterQuarterYear.args = createDefaultArgs({
  theme: "night",
  parameterType: "date_quarter_year",
  parameterValues: {
    [DATE_FILTER_ID]: "Q1-2024",
  },
});
DarkThemeDateFilterQuarterYear.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date Quarter and Year",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();
  const month = popover.getByText("Q2");
  month.classList.add("pseudo-hover");
};

export const DarkThemeDateFilterQuarterYearDropdown = Template.bind({});
DarkThemeDateFilterQuarterYearDropdown.args = createDefaultArgs({
  theme: "night",
  parameterType: "date_quarter_year",
  parameterValues: {
    [DATE_FILTER_ID]: "Q1-2024",
  },
});
DarkThemeDateFilterQuarterYearDropdown.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date Quarter and Year",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();

  await userEvent.click(
    popover.getAllByDisplayValue("2024").at(-1) as HTMLElement,
  );
  const dropdown = getLastPopover();
  dropdown
    .getByRole("option", { name: "2023" })
    .setAttribute("data-hovered", "true");
};

// Single date
export const LightThemeDateFilterSingle = Template.bind({});
LightThemeDateFilterSingle.args = createDefaultArgs({
  parameterType: "date_single",
  parameterValues: {
    [DATE_FILTER_ID]: "2024-06-01",
  },
});
LightThemeDateFilterSingle.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date single",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();
  popover.getByText("15").classList.add("pseudo-hover");
};

export const DarkThemeDateFilterSingle = Template.bind({});
DarkThemeDateFilterSingle.args = createDefaultArgs({
  theme: "night",
  parameterType: "date_single",
  parameterValues: {
    [DATE_FILTER_ID]: "2024-06-01",
  },
});
DarkThemeDateFilterSingle.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date single",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();
  popover.getByText("15").classList.add("pseudo-hover");
};

// Range
export const LightThemeDateFilterRange = Template.bind({});
LightThemeDateFilterRange.args = createDefaultArgs({
  parameterType: "date_range",
  parameterValues: {
    [DATE_FILTER_ID]: "2024-06-01~2024-06-10",
  },
});
LightThemeDateFilterRange.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date range",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();
  popover.getByText("15").classList.add("pseudo-hover");
};

export const DarkThemeDateFilterRange = Template.bind({});
DarkThemeDateFilterRange.args = createDefaultArgs({
  theme: "night",
  parameterType: "date_range",
  parameterValues: {
    [DATE_FILTER_ID]: "2024-06-01~2024-06-10",
  },
});
DarkThemeDateFilterRange.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date range",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();
  popover.getByText("15").classList.add("pseudo-hover");
};

// Relative
export const LightThemeDateFilterRelative = Template.bind({});
LightThemeDateFilterRelative.args = createDefaultArgs({
  parameterType: "date_relative",
  parameterValues: {
    [DATE_FILTER_ID]: "thisday",
  },
});
LightThemeDateFilterRelative.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date relative",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();
  popover
    .getByRole("button", { name: "Yesterday" })
    .classList.add("pseudo-hover");
};

export const DarkThemeDateFilterRelative = Template.bind({});
DarkThemeDateFilterRelative.args = createDefaultArgs({
  theme: "night",
  parameterType: "date_relative",
  parameterValues: {
    [DATE_FILTER_ID]: "thisday",
  },
});
DarkThemeDateFilterRelative.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const filter = await canvas.findByRole("button", {
    name: "Date relative",
  });
  await userEvent.click(filter);

  const popover = getLastPopover();
  popover
    .getByRole("button", { name: "Yesterday" })
    .classList.add("pseudo-hover");
};
