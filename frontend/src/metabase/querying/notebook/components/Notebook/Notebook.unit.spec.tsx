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
  mockScrollBy,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { RecentMetric } from "metabase/browse/metrics";
import {
  createMockMetricResult,
  createMockRecentMetric,
} from "metabase/browse/metrics/test-utils";
import type { RecentModel } from "metabase/browse/models";
import {
  createMockModelResult,
  createMockRecentModel,
} from "metabase/browse/models/test-utils";
import type { DataPickerValue } from "metabase/common/components/DataPicker";
import { checkNotNull } from "metabase/lib/types";
import type { IconName } from "metabase/ui";
import {
  SAMPLE_METADATA,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type {
  CardType,
  CollectionItemModel,
  RecentItem,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockRecentCollectionItem,
  createMockRecentTableItem,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { Notebook, type NotebookProps } from "./Notebook";

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
const TEST_RECENT_METRIC = createMockRecentMetric(
  createMockMetricResult({
    collection: TEST_COLLECTION,
    name: "Metric",
  }) as unknown as RecentMetric,
);
const TEST_RECENT_MODEL = createMockRecentModel(
  createMockModelResult({
    collection: TEST_COLLECTION,
    name: "Model",
  }) as unknown as RecentModel,
);

const TEST_RECENT_CARD = createMockRecentCollectionItem({
  model: "card",
  name: "Card",
  parent_collection: TEST_COLLECTION,
});

const dataPickerValueMap: Record<
  DataPickerValue["model"],
  {
    tabIcon: IconName;
    tabDisplayName: string;
    recentItem: RecentItem;
    itemPickerData: string[];
    pickerColIdx?: number;
  }
> = {
  table: {
    tabIcon: "table",
    tabDisplayName: "Tables",
    recentItem: TEST_RECENT_TABLE,
    itemPickerData: checkNotNull(MOCK_DATABASE.tables).map(
      table => table.display_name,
    ),
    pickerColIdx: 2, // tables are always level 2 in the data picker
  },
  card: {
    tabIcon: "folder",
    tabDisplayName: "Collections",
    recentItem: TEST_RECENT_CARD,
    itemPickerData: ["card"],
  },
  dataset: {
    tabIcon: "folder",
    tabDisplayName: "Collections",
    recentItem: TEST_RECENT_MODEL,
    itemPickerData: ["dataset"],
  },
  metric: {
    tabIcon: "folder",
    tabDisplayName: "Collections",
    recentItem: TEST_RECENT_METRIC,
    itemPickerData: ["metric"],
  },
};

const TEST_ENTITY_TYPES: DataPickerValue["model"][] = [
  "table",
  "metric",
  "card",
  "dataset",
] as const;

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
  mockScrollBy();

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

  const collectionItems = TEST_ENTITY_TYPES.map(entityType =>
    createMockCollectionItem({
      model: entityType as CollectionItemModel,
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
  const query = createQueryWithClauses({
    aggregations: [{ operatorName: "count" }],
  });
  return new Question(createMockCard({ type }), SAMPLE_METADATA).setQuery(
    query,
  );
}

describe("Notebook", () => {
  it.each<CardType>(["question", "model"])(
    "should have regular copy for the summarize step for %s queries",
    type => {
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
    type => {
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
    describe("tab behavior", () => {
      it("should not show tabs if only no type is chosen and recents are populated", async () => {
        setup({
          question: createSummarizedQuestion("question"),
          modelsFilterList: [],
        });

        await goToEntityModal();

        expect(
          await screen.findByTestId("single-picker-view"),
        ).toBeInTheDocument();
      });

      it("should not show tabs if only one type is chosen and recents are not populated", async () => {
        setup({
          question: createSummarizedQuestion("question"),
          modelsFilterList: ["table"],
          hasRecents: false,
        });

        await goToEntityModal();

        expect(
          await screen.findByTestId("single-picker-view"),
        ).toBeInTheDocument();

        assertDataInPickerColumn({
          columnIndex: Number(dataPickerValueMap["table"].pickerColIdx),
          data: dataPickerValueMap["table"].itemPickerData,
        });
      });

      // eslint-disable-next-line jest/expect-expect
      it("should show tabs if more than one type is chosen", async () => {
        const models: DataPickerValue["model"][] = ["dataset", "card"];

        setup({
          question: createSummarizedQuestion("question"),
          modelsFilterList: models,
          hasRecents: false,
        });

        await goToEntityModal();

        for (const model of models) {
          const { pickerColIdx = 1, itemPickerData } =
            dataPickerValueMap[model];

          await userEvent.click(screen.getByText("Our analytics"));

          assertDataInPickerColumn({
            columnIndex: pickerColIdx,
            data: itemPickerData,
          });
        }
      });

      it("should show all tabs if no filter is selected", async () => {
        setup({
          question: createSummarizedQuestion("question"),
        });

        await goToEntityModal();

        expect(await screen.findByTestId("tabs-view")).toBeInTheDocument();

        for (const model of TEST_ENTITY_TYPES) {
          const { tabDisplayName, tabIcon } = dataPickerValueMap[model];

          await goToDataPickerTab({
            name: tabDisplayName,
            iconName: tabIcon,
          });
        }
      });
    });

    describe.each<DataPickerValue["model"]>(TEST_ENTITY_TYPES)(
      "when filtering with %s",
      entityType => {
        // eslint-disable-next-line jest/expect-expect
        it(`should show the Collection item picker when modelsFilterList=[${entityType}]`, async () => {
          setup({
            question: createSummarizedQuestion("question"),
            modelsFilterList: [entityType],
          });

          const {
            pickerColIdx = 1,
            tabDisplayName,
            tabIcon,
            recentItem,
            itemPickerData,
          } = dataPickerValueMap[entityType];

          await goToEntityModal();

          await goToDataPickerTab({ name: tabDisplayName, iconName: tabIcon });

          if (entityType !== "table") {
            // nested items so we want to go to the next nesting
            await userEvent.click(await screen.findByText("Our analytics"));
          }

          assertDataInPickerColumn({
            columnIndex: pickerColIdx,
            data: itemPickerData,
          });

          await goToDataPickerTab({ name: "Recents", iconName: "clock" });

          assertDataInRecents({
            data: [
              "display_name" in recentItem
                ? recentItem.display_name
                : recentItem.name,
            ],
          });
        });
      },
    );
  });
});

const goToEntityModal = async () => {
  await userEvent.click(screen.getByText("Orders"));

  expect(screen.getByTestId("entity-picker-modal")).toBeInTheDocument();

  await waitForLoaderToBeRemoved();
  await waitForLoaderToBeRemoved();
};

const goToDataPickerTab = async ({
  name,
  iconName,
}: {
  name: string;
  iconName: IconName;
}) => {
  const tabsView = within(screen.getByTestId("tabs-view"));

  const tabButton = tabsView.getByRole("tab", {
    name: `${iconName} icon ${name}`,
  });

  expect(
    within(tabButton).getByLabelText(`${iconName} icon`),
  ).toBeInTheDocument();

  await userEvent.click(tabsView.getByText(name));

  expect(tabButton).toHaveAttribute("data-active", "true");
};

const assertDataInPickerColumn = ({
  columnIndex,
  data,
}: {
  columnIndex: number;
  data: string[];
}) => {
  data.forEach(d => {
    expect(
      within(screen.getByTestId(`item-picker-level-${columnIndex}`)).getByText(
        d,
      ),
    ).toBeInTheDocument();
  });
};

const assertDataInRecents = ({ data }: { data: string[] }) => {
  data.forEach(d => {
    expect(
      within(screen.getByRole("tabpanel", { name: /Recents/ })).getByText(d),
    ).toBeInTheDocument();
  });
};
