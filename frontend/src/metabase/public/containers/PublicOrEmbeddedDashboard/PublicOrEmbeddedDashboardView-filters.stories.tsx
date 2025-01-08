// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { StoryContext, StoryFn } from "@storybook/react";
import { userEvent, within } from "@storybook/testing-library";
import { type ComponentProps, useEffect } from "react";

import { getStore } from "__support__/entities-store";
import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { MetabaseReduxProvider } from "metabase/lib/redux/custom-context";
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

import {
  PublicOrEmbeddedDashboardView,
  type PublicOrEmbeddedDashboardViewProps,
} from "./PublicOrEmbeddedDashboardView";

export default {
  title: "embed/PublicOrEmbeddedDashboardView/filters",
  component: PublicOrEmbeddedDashboardView,
  decorators: [
    ReduxDecorator,
    WaitForResizeToStopDecorator,
    MockIsEmbeddingDecorator,
  ],
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    parameterType: {
      options: ["text", "dropdown_multiple"],
      control: { type: "select" },
    },
  },
};

function ReduxDecorator(Story: StoryFn, context: StoryContext) {
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
    <MetabaseReduxProvider store={store}>
      <Story />
    </MetabaseReduxProvider>
  );
}

/**
 * This is an arbitrary number, it should be big enough to pass CI tests.
 * This works because we set delays for ExplicitSize to 0 in storybook.
 */
const TIME_UNTIL_ALL_ELEMENTS_STOP_RESIZING = 1500;
function WaitForResizeToStopDecorator(Story: StoryFn) {
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
function MockIsEmbeddingDecorator(Story: StoryFn) {
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
const CATEGORY_SINGLE_FILTER = createMockParameter({
  id: "category-hex",
  name: "Category",
  slug: "category",
  isMultiSelect: false,
});
const NUMBER_FILTER_ID = "number-hex";
const DATE_FILTER_ID = "date-hex";
const UNIT_OF_TIME_FILTER_ID = "unit-of-time-hex";

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
          {
            card_id: CARD_BAR_ID,
            parameter_id: UNIT_OF_TIME_FILTER_ID,
            target: [
              "dimension",
              [
                "field",
                PRODUCTS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
          },
          {
            card_id: CARD_BAR_ID,
            parameter_id: NUMBER_FILTER_ID,
            target: [
              "dimension",
              ["field", PRODUCTS.RATING, { "base-type": "type/Float" }],
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

const Template: StoryFn<PublicOrEmbeddedDashboardViewProps> = args => {
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
    number: getDashboardUiParameters(
      dashboard.dashcards,
      [
        createMockParameter({
          id: NUMBER_FILTER_ID,
          name: "Number Equals",
          sectionId: "number",
          slug: "number_equals",
          type: "number/=",
        }),
      ],
      createMockMetadata({}),
      {},
    ),
    dropdown_multiple: getDashboardUiParameters(
      dashboard.dashcards,
      [CATEGORY_FILTER],
      createMockMetadata({
        databases: [createSampleDatabase()],
      }),
      {},
    ),
    dropdown_single: getDashboardUiParameters(
      dashboard.dashcards,
      [CATEGORY_SINGLE_FILTER],
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
    temporal_unit: getDashboardUiParameters(
      dashboard.dashcards,
      [
        createMockParameter({
          id: UNIT_OF_TIME_FILTER_ID,
          name: "Time grouping",
          sectionId: "temporal-unit",
          slug: "unit_of_time",
          type: "temporal-unit",
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
  | "number"
  | "dropdown_multiple"
  | "dropdown_single"
  | "search"
  | "date_all_options"
  | "date_month_year"
  | "date_quarter_year"
  | "date_single"
  | "date_range"
  | "date_relative"
  | "temporal_unit";

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

function getLastPopoverElement() {
  const lastPopover = Array.from(
    document.documentElement.querySelectorAll(
      '[data-element-id="mantine-popover"]',
    ),
  ).at(-1) as HTMLElement;

  return lastPopover;
}

export const LightThemeText = {
  render: Template,
  args: createDefaultArgs(),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", { name: "Category" });
    await userEvent.click(filter);
  },
};

export const LightThemeTextWithValue = {
  render: Template,
  args: createDefaultArgs(),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const asyncCallback = createAsyncCallback();
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", { name: "Category" });
    await userEvent.click(filter);

    const popover = getLastPopover();
    await userEvent.type(
      popover.getByPlaceholderText("Enter some text"),
      "filter value",
    );
    await userEvent.click(getLastPopoverElement());
    asyncCallback();
  },
};

export const LightThemeParameterSearch = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "search",
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", { name: "Category" });
    await userEvent.click(filter);
  },
};

export const LightThemeParameterSearchWithValue = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "search",
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
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
  },
};

export const DarkThemeText = {
  render: Template,
  args: createDefaultArgs({ theme: "night" }),
  play: LightThemeText.play,
};

export const DarkThemeTextWithValue = {
  render: Template,
  args: createDefaultArgs({ theme: "night" }),
  play: LightThemeTextWithValue.play,
};

export const DarkThemeParameterSearch = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "search",
  }),

  play: LightThemeParameterSearch.play,
};

export const DarkThemeParameterSearchWithValue = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "search",
  }),

  play: LightThemeParameterSearchWithValue.play,
};

export const LightThemeParameterList = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "dropdown_multiple",
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", { name: "Category" });
    await userEvent.click(filter);
  },
};

export const LightThemeParameterListWithValue = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "dropdown_multiple",
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", { name: "Category" });
    await userEvent.click(filter);

    const popover = getLastPopover();
    await userEvent.type(popover.getByPlaceholderText("Search the list"), "g");
    await userEvent.click(popover.getByText("Widget"));
    const gizmo = popover.getByRole("checkbox", {
      name: "Gizmo",
    }) as HTMLInputElement;
    gizmo.disabled = true;
  },
};

export const DarkThemeParameterList = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "dropdown_multiple",
  }),

  play: LightThemeParameterList.play,
};

export const DarkThemeParameterListWithValue = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "dropdown_multiple",
  }),

  play: LightThemeParameterListWithValue.play,
};

export const LightThemeParameterListSingleWithValue = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "dropdown_single",
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", { name: "Category" });
    await userEvent.click(filter);

    const documentElement = within(document.documentElement);
    await userEvent.type(
      documentElement.getByPlaceholderText("Search the list"),
      "g",
    );
    await userEvent.click(documentElement.getByText("Widget"));
    const popover = getLastPopover();
    (popover.getByText("Gadget").parentNode as HTMLElement).classList.add(
      "pseudo-hover",
    );
  },
};

export const DarkThemeParameterListSingleWithValue = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "dropdown_single",
  }),

  play: LightThemeParameterListSingleWithValue.play,
};

export const LightThemeDateFilterAllOptions = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "date_all_options",
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", {
      name: "Date all options",
    });
    await userEvent.click(filter);

    const popover = getLastPopover();
    const today = popover.getByRole("button", { name: "Today" });
    today.classList.add("pseudo-hover");
  },
};

export const DarkThemeDateFilterAllOptions = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "date_all_options",
  }),

  play: LightThemeDateFilterAllOptions.play,
};

export const LightThemeDateFilterMonthYear = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "date_month_year",
    parameterValues: {
      [DATE_FILTER_ID]: "2024-01",
    },
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", {
      name: "Date Month and Year",
    });
    await userEvent.click(filter);

    const popover = getLastPopover();
    const month = popover.getByText("May");
    month.classList.add("pseudo-hover");
  },
};

export const DarkThemeDateFilterMonthYear = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "date_month_year",
    parameterValues: {
      [DATE_FILTER_ID]: "2024-01",
    },
  }),

  play: LightThemeDateFilterMonthYear.play,
};

export const LightThemeDateFilterQuarterYear = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "date_quarter_year",
    parameterValues: {
      [DATE_FILTER_ID]: "Q1-2024",
    },
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", {
      name: "Date Quarter and Year",
    });
    await userEvent.click(filter);

    const popover = getLastPopover();
    const month = popover.getByText("Q2");
    month.classList.add("pseudo-hover");
  },
};

export const LightThemeDateFilterQuarterYearDropdown = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "date_quarter_year",
    parameterValues: {
      [DATE_FILTER_ID]: "Q1-2024",
    },
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", {
      name: "Date Quarter and Year",
    });
    await userEvent.click(filter);

    const popover = getLastPopover();
    await userEvent.click(popover.getByText("2024"));
    popover.getByRole("button", { name: "2023" }).classList.add("pseudo-hover");
  },
};

export const DarkThemeDateFilterQuarterYear = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "date_quarter_year",
    parameterValues: {
      [DATE_FILTER_ID]: "Q1-2024",
    },
  }),

  play: LightThemeDateFilterQuarterYear.play,
};

export const DarkThemeDateFilterQuarterYearDropdown = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "date_quarter_year",
    parameterValues: {
      [DATE_FILTER_ID]: "Q1-2024",
    },
  }),

  play: LightThemeDateFilterQuarterYearDropdown.play,
};

export const LightThemeDateFilterSingle = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "date_single",
    parameterValues: {
      [DATE_FILTER_ID]: "2024-06-01",
    },
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", {
      name: "Date single",
    });
    await userEvent.click(filter);

    const popover = getLastPopover();
    popover.getByText("15").classList.add("pseudo-hover");
  },
};

export const DarkThemeDateFilterSingle = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "date_single",
    parameterValues: {
      [DATE_FILTER_ID]: "2024-06-01",
    },
  }),

  play: LightThemeDateFilterSingle.play,
};

export const LightThemeDateFilterRange = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "date_range",
    parameterValues: {
      [DATE_FILTER_ID]: "2024-06-01~2024-06-10",
    },
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", {
      name: "Date range",
    });
    await userEvent.click(filter);

    const popover = getLastPopover();
    await userEvent.click(popover.getByRole("button", { name: "Add time" }));
    popover.getAllByText("15")[0].classList.add("pseudo-hover");
  },
};

export const DarkThemeDateFilterRange = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "date_range",
    parameterValues: {
      [DATE_FILTER_ID]: "2024-06-01~2024-06-10",
    },
  }),

  play: LightThemeDateFilterRange.play,
};

export const LightThemeDateFilterRelative = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "date_relative",
    parameterValues: {
      [DATE_FILTER_ID]: "thisday",
    },
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", {
      name: "Date relative",
    });
    await userEvent.click(filter);

    const popover = getLastPopover();
    popover
      .getByRole("button", { name: "Yesterday" })
      .classList.add("pseudo-hover");
  },
};

export const DarkThemeDateFilterRelative = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "date_relative",
    parameterValues: {
      [DATE_FILTER_ID]: "thisday",
    },
  }),

  play: LightThemeDateFilterRelative.play,
};

export const LightThemeUnitOfTime = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "temporal_unit",
    parameterValues: {
      [UNIT_OF_TIME_FILTER_ID]: "minute",
    },
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", {
      name: "Time grouping",
    });
    await userEvent.click(filter);

    const popover = getLastPopover();
    (popover.getByText("Hour").parentNode as HTMLElement).classList.add(
      "pseudo-hover",
    );
  },
};

export const DarkThemeUnitOfTime = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "temporal_unit",
    parameterValues: {
      [UNIT_OF_TIME_FILTER_ID]: "minute",
    },
  }),

  play: LightThemeUnitOfTime.play,
};

export const LightThemeNumber = {
  render: Template,

  args: createDefaultArgs({
    parameterType: "number",
  }),

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const filter = await canvas.findByRole("button", {
      name: "Number Equals",
    });
    await userEvent.click(filter);

    const popover = getLastPopover();
    const searchInput = popover.getByPlaceholderText("Enter a number");
    await userEvent.type(searchInput, "11");
    await userEvent.click(getLastPopoverElement());

    await userEvent.type(searchInput, "99");
  },
};

export const DarkThemeNumber = {
  render: Template,

  args: createDefaultArgs({
    theme: "night",
    parameterType: "number",
  }),

  play: LightThemeNumber.play,
};
