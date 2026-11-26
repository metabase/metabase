import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import {
  setupCardDataset,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { DataPickerValue } from "metabase/common/components/Pickers/DataPicker";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { CardType, RecentItem } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockColumn,
  createMockDatasetData,
  createMockRecentCollectionItem,
  createMockRecentTableItem,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createOrdersCreatedAtDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { Notebook, type NotebookProps } from "./Notebook";

registerVisualizations();

type SetupOpts = Pick<NotebookProps, "question"> &
  Partial<
    Pick<
      NotebookProps,
      | "reportTimezone"
      | "readOnly"
      | "isRunnable"
      | "isDirty"
      | "isResultDirty"
      | "hasVisualizeButton"
      | "modelsFilterList"
    >
  > & {
    hasRecents?: boolean;
  };

const MOCK_DATABASE = createSampleDatabase();
const TEST_COLLECTION = createMockCollection({ id: "root" });

const TEST_RECENT_TABLE = createMockRecentTableItem();
const TEST_RECENT_METRIC = createMockRecentCollectionItem({
  model: "metric",
  name: "Metric",
});
const TEST_RECENT_MODEL = createMockRecentCollectionItem({
  model: "dataset",
  name: "Model",
});

const TEST_RECENT_CARD = createMockRecentCollectionItem({
  model: "card",
  name: "Card",
  parent_collection: TEST_COLLECTION,
});

const dataPickerValueMap: Record<
  Exclude<DataPickerValue["model"], "database">,
  {
    recentItem: RecentItem;
    itemPickerData: string[];
    pickerColIdx?: number;
  }
> = {
  table: {
    recentItem: TEST_RECENT_TABLE,
    itemPickerData: checkNotNull(MOCK_DATABASE.tables).map(
      (table) => table.display_name,
    ),
    pickerColIdx: 3, // tables are always level 3 in the data picker
  },
  card: {
    recentItem: TEST_RECENT_CARD,
    itemPickerData: ["card"],
  },
  dataset: {
    recentItem: TEST_RECENT_MODEL,
    itemPickerData: ["dataset"],
  },
  metric: {
    recentItem: TEST_RECENT_METRIC,
    itemPickerData: ["metric"],
  },
};

const TEST_ENTITY_TYPES: Exclude<DataPickerValue["model"], "database">[] = [
  "table",
  "metric",
  "card",
  "dataset",
];

function setup({
  question,
  reportTimezone = "UTC",
  readOnly = false,
  isRunnable = false,
  isDirty = false,
  isResultDirty = false,
  hasVisualizeButton = false,
  modelsFilterList = undefined,
  hasRecents = true,
}: SetupOpts) {
  setupDatabasesEndpoints([MOCK_DATABASE]);
  setupRecentViewsAndSelectionsEndpoints(
    hasRecents
      ? [
          TEST_RECENT_TABLE,
          TEST_RECENT_METRIC,
          TEST_RECENT_MODEL,
          TEST_RECENT_CARD,
        ]
      : [],
    ["selections"],
  );

  const collectionItems = TEST_ENTITY_TYPES.map((entityType) =>
    createMockCollectionItem({
      model: entityType,
      collection: TEST_COLLECTION,
      collection_id: TEST_COLLECTION.id,
      name: entityType,
    }),
  );

  setupSearchEndpoints(collectionItems);
  setupCollectionsEndpoints({ collections: [TEST_COLLECTION] });
  setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: TEST_COLLECTION,
    collectionItems,
  });
  setupCollectionItemsEndpoint({
    collection: { ...TEST_COLLECTION, id: 1 },
    collectionItems,
  });

  mockGetBoundingClientRect();

  const updateQuestion = jest.fn();
  const runQuestionQuery = jest.fn();
  const setQueryBuilderMode = jest.fn();

  renderWithProviders(
    <Notebook
      question={question}
      reportTimezone={reportTimezone}
      readOnly={readOnly}
      isRunnable={isRunnable}
      isDirty={isDirty}
      isResultDirty={isResultDirty}
      hasVisualizeButton={hasVisualizeButton}
      updateQuestion={updateQuestion}
      runQuestionQuery={runQuestionQuery}
      setQueryBuilderMode={setQueryBuilderMode}
      modelsFilterList={modelsFilterList}
    />,
  );

  return { updateQuestion, runQuestionQuery, setQueryBuilderMode };
}

function createSummarizedQuestion(type: CardType) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  });
  return new Question(createMockCard({ type }), SAMPLE_METADATA).setQuery(
    query,
  );
}

describe("Notebook", () => {
  it.each<CardType>(["question", "model"])(
    "should have regular copy for the summarize step for %s queries",
    (type) => {
      setup({
        question: createSummarizedQuestion(type),
      });

      const step = screen.getByTestId("step-summarize-0-0");
      expect(within(step).getByText("Summarize")).toBeInTheDocument();
      expect(within(step).getByText("by")).toBeInTheDocument();
      expect(within(step).getByLabelText("Remove step")).toBeInTheDocument();
      expect(within(step).queryByText("Formula")).not.toBeInTheDocument();
      expect(
        within(step).queryByText("Default time dimension"),
      ).not.toBeInTheDocument();
    },
  );

  it("should have metric-specific copy for the summarize step", () => {
    setup({
      question: createSummarizedQuestion("metric"),
    });

    const step = screen.getByTestId("step-summarize-0-0");
    expect(within(step).getByText("Formula")).toBeInTheDocument();
    expect(
      within(step).queryByText("Default time dimension"),
    ).not.toBeInTheDocument();
    expect(within(step).queryByText("Summarize")).not.toBeInTheDocument();
    expect(within(step).queryByText("by")).not.toBeInTheDocument();
    expect(
      within(step).queryByLabelText("Remove step"),
    ).not.toBeInTheDocument();
  });

  it.each<CardType>(["question", "model"])(
    "should be able to remove the summarize step for %s queries",
    (type) => {
      setup({
        question: createSummarizedQuestion(type),
      });

      const step = screen.getByTestId("step-summarize-0-0");
      expect(within(step).getByLabelText("Remove step")).toBeInTheDocument();
    },
  );

  it("should not be able to remove the summarize step for metrics", () => {
    setup({
      question: createSummarizedQuestion("metric"),
    });

    const step = screen.getByTestId("step-summarize-0-0");
    expect(
      within(step).queryByLabelText("Remove step"),
    ).not.toBeInTheDocument();
  });

  it("should preview the summarize step of a query with an offset aggregation", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            {
              name: "Offsetted sum of total",
              value: {
                type: "operator",
                operator: "offset",
                args: [
                  {
                    type: "operator",
                    operator: "sum",
                    args: [{ type: "column", name: "TOTAL" }],
                  },
                  { type: "literal", value: -1 },
                ],
              },
            },
          ],
          breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
        },
      ],
    });
    setup({
      question: new Question(createMockCard(), SAMPLE_METADATA).setQuery(query),
    });
    setupCardDataset();
    // Rows come back only for the offset aggregation of Sum of Total by month
    fetchMock.modifyRoute("dataset-post", {
      response: (call: CallLog) => {
        const isOffsetOfSumOfTotal = isOffsetOfSumOfTotalQuery(
          JSON.parse(String(call.options.body)),
        );
        return {
          data: isOffsetOfSumOfTotal
            ? createMockDatasetData({
                cols: [
                  createOrdersCreatedAtDatasetColumn({
                    display_name: "Created At: Month",
                    source: "breakout",
                    unit: "month",
                  }),
                  createMockColumn({
                    name: "Offsetted sum of total",
                    display_name: "Offsetted sum of total",
                    base_type: "type/Float",
                    effective_type: "type/Float",
                    source: "aggregation",
                  }),
                ],
                rows: [
                  ["2025-04-01T00:00:00Z", null],
                  ["2025-05-01T00:00:00Z", 52.76],
                ],
              })
            : createMockDatasetData({ cols: [], rows: [] }),
        };
      },
    });

    const step = screen.getByTestId("step-summarize-0-0");
    expect(
      within(step).getByText("Offsetted sum of total"),
    ).toBeInTheDocument();
    await userEvent.click(within(step).getByTestId("step-preview-button"));

    expect(await screen.findByText("52.76")).toBeInTheDocument();
    const [previewCall] = fetchMock.callHistory
      .calls("path:/api/dataset")
      .slice(-1);
    expect(
      isOffsetOfSumOfTotalQuery(JSON.parse(String(previewCall.options.body))),
    ).toBe(true);
    expect(screen.getByText("May 2025")).toBeInTheDocument();
    expect(screen.getByText("April 2025")).toBeInTheDocument();
  });

  describe("custom column action of the data step on a summarized stage (metabase#43226)", () => {
    async function openCustomColumnFromDataStep() {
      await userEvent.click(
        within(
          within(screen.getByTestId("step-data-0-0")).getByTestId(
            "action-buttons",
          ),
        ).getByRole("img", { name: "add_data icon" }),
      );
      return screen.findByTestId("step-expression-0-0");
    }

    it("should extract a column of the stage", async () => {
      setup({ question: createSummarizedQuestion("question") });

      expect(
        screen.queryByTestId("step-expression-0-0"),
      ).not.toBeInTheDocument();
      await openCustomColumnFromDataStep();

      await userEvent.click(
        await screen.findByRole("button", { name: /Extract columns/ }),
      );
      const [createdAt] = screen
        .getAllByTestId("dimension-list-item")
        .filter((item) => item.getAttribute("aria-label") === "Created At");
      await userEvent.click(within(createdAt).getByText("Created At"));
      await userEvent.click(
        within(screen.getByTestId("expression-editor")).getByRole("button", {
          name: /^Hour of day/,
        }),
      );

      expect(
        screen.getByTestId<HTMLTextAreaElement>(
          "custom-expression-query-editor",
        ).value,
      ).toBe("hour([Created At])");
      expect(screen.getByTestId("expression-name")).toHaveValue("Hour of day");
    });

    it("should combine columns of the stage", async () => {
      setup({ question: createSummarizedQuestion("question") });

      await openCustomColumnFromDataStep();
      await userEvent.click(
        await screen.findByRole("button", { name: /Combine columns/ }),
      );
      // The first column starts as the first column of the stage. The default
      // separator depends on the type of the first column.
      await userEvent.click(screen.getByRole("button", { name: "Created At" }));
      await userEvent.click(await screen.findByText("User"));
      await userEvent.click(await screen.findByText("Email"));

      expect(
        screen.getByRole("button", { name: /^User → Email/ }),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Separated by (empty)" }),
      );
      expect(screen.getByLabelText("Separator")).toHaveValue("");
    });
  });

  describe("when filtering with modelsFilterList", () => {
    describe.each<Exclude<DataPickerValue["model"], "database">>([
      "metric",
      "card",
      "dataset",
    ])("when filtering with %s", (entityType) => {
      it(`should show the entity picker when modelsFilterList=[${entityType}]`, async () => {
        setup({
          question: createSummarizedQuestion("question"),
          modelsFilterList: [entityType],
        });

        const {
          pickerColIdx = 1,
          recentItem,
          itemPickerData,
        } = dataPickerValueMap[entityType];

        await goToEntityModal();
        await userEvent.click(await screen.findByText(/Our analytics/));

        await assertDataInPickerColumn({
          columnIndex: pickerColIdx,
          data: itemPickerData,
        });

        await userEvent.click(await screen.findByText(/Recent items/));
        await waitForLoaderToBeRemoved();

        await assertDataInPickerColumn({
          columnIndex: 1,
          data: [recentItem.name],
        });
      });
    });
  });
});

const goToEntityModal = async () => {
  await userEvent.click(screen.getByText("Orders"));
  const popover = await screen.findByTestId("mini-picker");
  await userEvent.click(await within(popover).findByText("Sample Database"));
  await userEvent.click(await within(popover).findByText("Browse all"));

  expect(screen.getByTestId("entity-picker-modal")).toBeInTheDocument();

  await waitForLoaderToBeRemoved();
};

const assertDataInPickerColumn = async ({
  columnIndex,
  data,
}: {
  columnIndex: number;
  data: string[];
}) => {
  for (const datum of data) {
    await waitFor(() => {
      expect(
        within(
          screen.getByTestId(`item-picker-level-${columnIndex}`),
        ).getByText(datum),
      ).toBeInTheDocument();
    });
  }
};

function toArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

/**
 * One stage on Orders: `["offset", opts, ["sum", opts, ["field", opts,
 * ORDERS.TOTAL]], -1]` by Created At: Month, without filters or sorting.
 */
function isOffsetOfSumOfTotalQuery(body: unknown) {
  if (typeof body !== "object" || body == null || !("stages" in body)) {
    return false;
  }
  const stages = toArray(body.stages) ?? [];
  const [stage] = stages;
  if (stages.length !== 1 || typeof stage !== "object" || stage == null) {
    return false;
  }
  const stageEntries = Object.fromEntries(Object.entries(stage));
  const aggregations = toArray(stageEntries.aggregation) ?? [];
  const breakouts = toArray(stageEntries.breakout) ?? [];
  const [offsetOperator, , sum, offsetValue] = toArray(aggregations[0]) ?? [];
  const [sumOperator, , column] = toArray(sum) ?? [];
  const [columnType, , fieldId] = toArray(column) ?? [];
  const [breakoutType, breakoutOptions, breakoutFieldId] =
    toArray(breakouts[0]) ?? [];
  const breakoutUnit =
    typeof breakoutOptions === "object" &&
    breakoutOptions != null &&
    "temporal-unit" in breakoutOptions
      ? breakoutOptions["temporal-unit"]
      : null;
  return (
    stageEntries["source-table"] === ORDERS_ID &&
    stageEntries.filters == null &&
    stageEntries["order-by"] == null &&
    aggregations.length === 1 &&
    offsetOperator === "offset" &&
    offsetValue === -1 &&
    sumOperator === "sum" &&
    columnType === "field" &&
    fieldId === ORDERS.TOTAL &&
    breakouts.length === 1 &&
    breakoutType === "field" &&
    breakoutFieldId === ORDERS.CREATED_AT &&
    breakoutUnit === "month"
  );
}
