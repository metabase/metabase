import userEvent from "@testing-library/user-event";

import {
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
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { CardType, RecentItem } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockRecentCollectionItem,
  createMockRecentTableItem,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { Notebook, type NotebookProps } from "./Notebook";

// Set per-test for the entity-picker flows; a realistically-delayed instance
// used in place of the regime's delay-null userEvent.
let pickerUser: ReturnType<typeof userEvent.setup>;

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
      within(step).getAllByText("Default time dimension").length,
    ).toBeGreaterThanOrEqual(1);
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

  describe("when filtering with modelsFilterList", () => {
    // These flows drive the mini-picker popover and the multi-column entity
    // picker modal, whose Mantine transitions never settle under the
    // fake-timer regime; run them on real timers. Switching back to fake timers
    // between the cases leaks each picker's pending real timers into the next
    // test, so stay on real timers for the whole (final) block.
    beforeEach(() => {
      jest.useRealTimers();
      // The entity picker persists its last-used tab in localStorage, which
      // survives store recreation and leaks between these cases; reset it.
      localStorage.clear();
      // Drive these flows with a realistically-delayed userEvent (like stock):
      // the regime's delay-null clicks race ahead of the picker's async, which
      // then settles during the next case and corrupts it.
      pickerUser = userEvent.setup({ delay: 10 });
    });

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
        await pickerUser.click(await screen.findByText(/Our analytics/));

        await assertDataInPickerColumn({
          columnIndex: pickerColIdx,
          data: itemPickerData,
        });

        await pickerUser.click(await screen.findByText(/Recent items/));
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
  await pickerUser.click(screen.getByText("Orders"));
  const popover = await screen.findByTestId("mini-picker");
  await pickerUser.click(await within(popover).findByText("Sample Database"));
  await pickerUser.click(await within(popover).findByText("Browse all"));

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
