import userEvent from "@testing-library/user-event";

import { mockGetBoundingClientRect, screen, within } from "__support__/ui";
import type * as Analytics from "metabase/analytics";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { CardDisplayType } from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  PRODUCTS_ID,
  createProductsTableDatasetColumns,
} from "metabase-types/api/mocks/presets";

import { setup } from "./test-utils";

registerVisualizations();

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
const { trackSimpleEvent } =
  jest.requireMock<typeof Analytics>("metabase/analytics");

const PRODUCTS_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: createProductsTableDatasetColumns(),
    rows: [
      [
        1,
        "1018947080336",
        "Rustic Paper Wallet",
        "Gizmo",
        "Swaniawski, Casper and Hilll",
        29.46,
        4.6,
        "2026-04-01T00:00:00Z",
      ],
    ],
  }),
  row_count: 1,
});

const GROUPING_FORMULA_NAME = "Category!";

const GROUPING_FORMULA_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [
      createMockColumn({
        id: undefined,
        table_id: undefined,
        name: GROUPING_FORMULA_NAME,
        display_name: GROUPING_FORMULA_NAME,
        source: "breakout",
        base_type: "type/Text",
        effective_type: "type/Text",
        field_ref: ["expression", GROUPING_FORMULA_NAME],
      }),
      createMockNumericColumn({
        id: undefined,
        table_id: undefined,
        name: "count",
        display_name: "Count",
        source: "aggregation",
        field_ref: ["aggregation", 0],
      }),
    ],
    rows: [["Gizmo!", 51]],
  }),
  row_count: 1,
});

interface SetupOpts {
  display: CardDisplayType;
}

async function setupProducts({ display }: SetupOpts) {
  await setup({
    card: createMockUnsavedCard({
      display,
      visualization_settings: {},
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
        }),
      ),
    }),
    dataset: PRODUCTS_DATASET,
  });
}

async function setupGroupingFormula() {
  await setup({
    card: createMockUnsavedCard({
      display: "table",
      visualization_settings: {},
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: PRODUCTS_ID },
              expressions: [
                {
                  name: GROUPING_FORMULA_NAME,
                  value: {
                    type: "operator",
                    operator: "concat",
                    args: [
                      { type: "column", name: "CATEGORY" },
                      { type: "literal", value: "!" },
                    ],
                  },
                },
              ],
              aggregations: [{ type: "operator", operator: "count" }],
              breakouts: [{ type: "column", name: GROUPING_FORMULA_NAME }],
            },
          ],
        }),
      ),
    }),
    dataset: GROUPING_FORMULA_DATASET,
  });
}

async function editFormulaFromColumnHeader() {
  const header = await screen.findByRole("columnheader", {
    name: GROUPING_FORMULA_NAME,
  });
  await userEvent.click(within(header).getByText(GROUPING_FORMULA_NAME));
  await userEvent.click(await screen.findByText("Edit formula"));
}

async function sumPriceFromColumnHeader() {
  const header = await screen.findByRole("columnheader", { name: "Price" });
  await userEvent.click(within(header).getByText("Price"));
  await userEvent.click(await screen.findByText("Sum"));
}

function getSidebarOpenedEvents() {
  return jest
    .mocked(trackSimpleEvent)
    .mock.calls.map(([event]) => event)
    .filter((event) => event.event === "summary_sidebar_opened");
}

describe("QueryBuilder > summarize sidebar > analytics", () => {
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  afterEach(() => {
    jest.mocked(trackSimpleEvent).mockClear();
  });

  it("tracks the sidebar opened by an aggregation picked in a column header", async () => {
    await setupProducts({ display: "table" });

    await sumPriceFromColumnHeader();

    expect(await screen.findByText("Summarize by")).toBeInTheDocument();
    expect(getSidebarOpenedEvents()).toEqual([
      {
        event: "summary_sidebar_opened",
        triggered_from: "column_header_summarize",
        event_detail: "empty",
        target_id: null,
      },
    ]);
  });

  it("doesn't track a column header aggregation while the sidebar is open", async () => {
    await setupProducts({ display: "table" });
    await userEvent.click(
      await screen.findByRole("button", { name: /Summarize/ }),
    );
    expect(await screen.findByText("Summarize by")).toBeInTheDocument();

    await sumPriceFromColumnHeader();

    expect(await screen.findAllByText("Sum of Price")).not.toHaveLength(0);
    expect(screen.getByText("Summarize by")).toBeInTheDocument();
    expect(getSidebarOpenedEvents()).toEqual([
      expect.objectContaining({ triggered_from: "summarize_button" }),
    ]);
  });

  it("tracks the sidebar opened by Edit formula on a grouping formula column", async () => {
    await setupGroupingFormula();

    await editFormulaFromColumnHeader();

    expect(await screen.findByText("Summarize by")).toBeInTheDocument();
    expect(getSidebarOpenedEvents()).toEqual([
      {
        event: "summary_sidebar_opened",
        triggered_from: "column_header",
        event_detail: "summarized",
        target_id: null,
      },
    ]);
  });

  it("doesn't track Edit formula on a column header while the sidebar is open", async () => {
    await setupGroupingFormula();
    await userEvent.click(
      await screen.findByRole("button", { name: /Summarize/ }),
    );
    expect(await screen.findByText("Summarize by")).toBeInTheDocument();

    await editFormulaFromColumnHeader();

    expect(screen.getByText("Summarize by")).toBeInTheDocument();
    expect(getSidebarOpenedEvents()).toEqual([
      expect.objectContaining({ triggered_from: "summarize_button" }),
    ]);
  });

  it("tracks the sidebar opened from the chart placeholder", async () => {
    await setupProducts({ display: "bar" });

    await userEvent.click(
      await screen.findByRole("button", { name: "Open summarize sidebar" }),
    );

    expect(await screen.findByText("Summarize by")).toBeInTheDocument();
    expect(getSidebarOpenedEvents()).toEqual([
      {
        event: "summary_sidebar_opened",
        triggered_from: "chart_placeholder",
        event_detail: "empty",
        target_id: null,
      },
    ]);
  });
});
