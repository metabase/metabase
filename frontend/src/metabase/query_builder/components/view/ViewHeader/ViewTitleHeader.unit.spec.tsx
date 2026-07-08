import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentProps } from "react";
import _ from "underscore";

import { setupTableEndpoints } from "__support__/server-mocks";
import { setupGetUserKeyValueEndpoint } from "__support__/server-mocks/user-key-value";
import { createMockEntitiesState } from "__support__/store";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { getMetadata } from "metabase/selectors/metadata";
import MetabaseSettings from "metabase/utils/settings";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  Database,
  NativeDatasetQuery,
  StructuredDatasetQuery,
  UnsavedCard,
} from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockDataset,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createAdHocCard,
  createAdHocNativeCard,
  createOrdersTable,
  createProductsTable,
  createSampleDatabase,
  createSavedNativeCard,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

import { ViewTitleHeader } from "./ViewTitleHeader";

console.warn = jest.fn();
console.error = jest.fn();

const ORDERS_TABLE = createOrdersTable();
const PRODUCTS_TABLE = createProductsTable();
const HIDDEN_ORDERS_TABLE = createOrdersTable({
  visibility_type: "hidden",
});

const FILTERED_GUI_QUESTION: Partial<UnsavedCard<StructuredDatasetQuery>> = {
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      filter: [
        "and",
        ["<", ["field", ORDERS.TOTAL, null], 50],
        ["not-null", ["field", ORDERS.TAX, null]],
      ],
    },
  },
};

const SAVED_QUESTION = {
  id: 1,
  name: "Q1",
  description: null,
  collection_id: null,
  can_write: true,
};

function getAdHocQuestionCard(
  overrides?: Partial<UnsavedCard<StructuredDatasetQuery>>,
): UnsavedCard<StructuredDatasetQuery> {
  return createAdHocCard(overrides);
}

function getNativeQuestionCard(): UnsavedCard<NativeDatasetQuery> {
  return createAdHocNativeCard();
}

function getSavedGUIQuestionCard(
  overrides?: Partial<Card<StructuredDatasetQuery>>,
): Card<StructuredDatasetQuery> {
  return createSavedStructuredCard({ ...SAVED_QUESTION, ...overrides });
}

function getSavedNativeQuestionCard(
  overrides?: Partial<Card<NativeDatasetQuery>>,
): Card<NativeDatasetQuery> {
  return createSavedNativeCard({ ...SAVED_QUESTION, ...overrides });
}

function mockSettings({ enableNestedQueries = true } = {}) {
  MetabaseSettings.get = jest.fn().mockImplementation((key: string) => {
    if (key === "enable-nested-queries") {
      return enableNestedQueries;
    }
    return false;
  });
}

interface SetupOpts extends Partial<ComponentProps<typeof ViewTitleHeader>> {
  card: Card | UnsavedCard;
  database?: Database | null;
  settings?: { enableNestedQueries?: boolean };
  hideOrdersTable?: boolean;
}

function setup({
  card,
  database = createSampleDatabase(),
  settings,
  isActionListVisible = true,
  isAdditionalInfoVisible = true,
  isDirty = false,
  isRunnable = true,
  hideOrdersTable = false,
  ...props
}: SetupOpts) {
  mockSettings(settings);

  setupTableEndpoints(ORDERS_TABLE);
  setupTableEndpoints(PRODUCTS_TABLE);
  setupGetUserKeyValueEndpoint({
    namespace: "user_acknowledgement",
    key: "turn_into_model_modal",
    value: false,
  });

  const callbacks = {
    runQuestionQuery: jest.fn(),
    updateQuestion: jest.fn(),
    setQueryBuilderMode: jest.fn(),
    onOpenModal: jest.fn(),
    onAddFilter: jest.fn(),
    onCloseFilter: jest.fn(),
    editSummary: jest.fn(),
    onOpenQuestionInfo: jest.fn(),
    onCloseSummary: jest.fn(),
    onSave: jest.fn(),
  };

  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: database ? [database] : [],
      questions: "id" in card ? [card] : [],
      tables: hideOrdersTable
        ? [PRODUCTS_TABLE, HIDDEN_ORDERS_TABLE]
        : undefined,
    }),
  });

  const metadata = getMetadata(storeInitialState);
  const question =
    "id" in card
      ? checkNotNull(metadata.question(card.id))
      : new Question(card, metadata);

  const viewTitleHeaderProps: ComponentProps<typeof ViewTitleHeader> = {
    isNavBarOpen: false,
    isObjectDetail: false,
    isBookmarked: false,
    isSaved: false,
    isModelOrMetric: false,
    isNativeEditorOpen: false,
    isShowingSummarySidebar: false,
    isResultDirty: false,
    isShowingQuestionInfoSidebar: false,
    areFiltersExpanded: false,
    queryBuilderMode: "dataset",
    isRunning: false,
    toggleBookmark: jest.fn(),
    cancelQuery: jest.fn(),
    onExpandFilters: jest.fn(),
    onCollapseFilters: jest.fn(),
    onCloseQuestionInfo: jest.fn(),
    ...callbacks,
    ...props,
    question,
    isActionListVisible,
    isAdditionalInfoVisible,
    isDirty,
    isRunnable,
  };

  renderWithProviders(
    <Route
      path="/"
      component={() => <ViewTitleHeader {...viewTitleHeaderProps} />}
    />,
    {
      withRouter: true,
      storeInitialState,
    },
  );

  return { question, ...callbacks };
}

function setupAdHoc(props: Partial<SetupOpts> = {}) {
  return setup({ card: getAdHocQuestionCard(), ...props });
}

function setupNative(props?: Partial<SetupOpts>) {
  return setup({ card: getNativeQuestionCard(), ...props });
}

function setupSavedNative(props: Partial<SetupOpts> = {}) {
  const collection = {
    id: "root",
    name: "Our analytics",
  };

  fetchMock.get("path:/api/collection/root", collection);

  const utils = setup({ card: getSavedNativeQuestionCard(), ...props });

  return {
    ...utils,
    collection,
  };
}

describe("ViewTitleHeader", () => {
  const TEST_CASE = {
    SAVED_GUI_QUESTION: {
      card: getSavedGUIQuestionCard(),
      questionType: "saved GUI question",
    },
    AD_HOC_QUESTION: {
      card: getAdHocQuestionCard(),
      questionType: "ad-hoc GUI question",
    },
    NATIVE_QUESTION: {
      card: getNativeQuestionCard(),
      questionType: "not saved native question",
    },
    SAVED_NATIVE_QUESTION: {
      card: getSavedNativeQuestionCard(),
      questionType: "saved native question",
    },
  };

  const ALL_TEST_CASES = Object.values(TEST_CASE);
  const GUI_TEST_CASES = [
    TEST_CASE.SAVED_GUI_QUESTION,
    TEST_CASE.AD_HOC_QUESTION,
  ];
  const NATIVE_TEST_CASES = [
    TEST_CASE.SAVED_NATIVE_QUESTION,
    TEST_CASE.NATIVE_QUESTION,
  ];
  const SAVED_QUESTIONS_TEST_CASES = [
    TEST_CASE.SAVED_GUI_QUESTION,
    TEST_CASE.SAVED_NATIVE_QUESTION,
  ];

  describe("Common", () => {
    ALL_TEST_CASES.forEach((testCase) => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("offers to save", () => {
          const { onOpenModal } = setup({ card, isDirty: true });
          fireEvent.click(screen.getByText("Save"));
          expect(onOpenModal).toHaveBeenCalledWith("save");
        });

        it("does not offer to save if it's not dirty", () => {
          setup({ card, isDirty: false });
          expect(screen.queryByText("Save")).not.toBeInTheDocument();
        });

        it("offers to refresh query results", () => {
          const { runQuestionQuery } = setup({ card });
          fireEvent.click(screen.getByLabelText("refresh icon"));
          expect(runQuestionQuery).toHaveBeenCalledWith({ ignoreCache: true });
        });

        it("does not offer to refresh query results if question is not runnable", () => {
          setup({ card, isRunnable: false });
          expect(
            screen.queryByLabelText("refresh icon"),
          ).not.toBeInTheDocument();
        });

        it("does not offer to modify a query when a user doesn't have data permissions", () => {
          setup({ card, database: null });
          expect(screen.queryByText("Filter")).not.toBeInTheDocument();
          expect(
            screen.queryByTestId("filters-visibility-control"),
          ).not.toBeInTheDocument();
          expect(screen.queryByText("Summarize")).not.toBeInTheDocument();
          expect(
            screen.queryByTestId("notebook-button"),
          ).not.toBeInTheDocument();
          expect(screen.getByLabelText("refresh icon")).toBeInTheDocument();
        });

        it("displays refresh button tooltip for the refresh button", async () => {
          setup({ card });
          const refreshButton = screen.getByLabelText("refresh icon");
          await userEvent.hover(refreshButton);
          const tooltip = await screen.findByRole("tooltip");
          expect(tooltip).toHaveTextContent("Refresh");
        });
      });
    });
  });

  describe("GUI", () => {
    GUI_TEST_CASES.forEach((testCase) => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("displays database and table names", async () => {
          setup({ card });

          expect(
            await screen.findByText("Sample Database"),
          ).toBeInTheDocument();
          expect(await screen.findByText("Orders")).toBeInTheDocument();
        });

        it("offers to filter query results", () => {
          setup({
            card,
            queryBuilderMode: "view",
          });
          expect(screen.getByText("Filter")).toBeInTheDocument();
        });

        it("offers to summarize query results", () => {
          const { editSummary } = setup({
            card,
            queryBuilderMode: "view",
          });
          fireEvent.click(screen.getByText("Summarize"));
          expect(editSummary).toHaveBeenCalled();
        });

        it("allows to open notebook editor", () => {
          const { setQueryBuilderMode } = setup({
            card,
            queryBuilderMode: "view",
          });
          fireEvent.click(screen.getByTestId("notebook-button"));
          expect(setQueryBuilderMode).toHaveBeenCalledWith("notebook");
        });

        it("allows to close notebook editor", () => {
          const { setQueryBuilderMode } = setup({
            card,
            queryBuilderMode: "notebook",
            result: createMockDataset(),
          });
          fireEvent.click(screen.getByTestId("notebook-button"));
          expect(setQueryBuilderMode).toHaveBeenCalledWith("view");
        });

        it("does not offer to filter query results in notebook mode", () => {
          setup({ card, queryBuilderMode: "notebook" });
          expect(screen.queryByText("Filter")).not.toBeInTheDocument();
        });

        it("does not offer to filter query in detail view", () => {
          setup({ card, isObjectDetail: true });
          expect(screen.queryByText("Filter")).not.toBeInTheDocument();
        });

        it("does not offer to summarize query results in notebook mode", () => {
          setup({ card, queryBuilderMode: "notebook" });
          expect(screen.queryByText("Summarize")).not.toBeInTheDocument();
        });

        it("does not offer to summarize query in detail view", () => {
          setup({ card, isObjectDetail: true });
          expect(screen.queryByText("Summarize")).not.toBeInTheDocument();
        });
      });
    });
  });

  describe("Native", () => {
    NATIVE_TEST_CASES.forEach((testCase) => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("does not offer to filter query results", () => {
          setup({ card });
          expect(screen.queryByText("Filter")).not.toBeInTheDocument();
        });

        it("does not offer to summarize query results", () => {
          setup({ card });
          expect(screen.queryByText("Summarize")).not.toBeInTheDocument();
        });

        it("does not offer to refresh query results if native editor is open", () => {
          setup({ card, isNativeEditorOpen: true });
          expect(
            screen.queryByLabelText("refresh icon"),
          ).not.toBeInTheDocument();
        });
      });
    });
  });

  describe("Saved", () => {
    SAVED_QUESTIONS_TEST_CASES.forEach((testCase) => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        beforeEach(() => {
          fetchMock.get("path:/api/collection/root", {
            id: "root",
            name: "Our analytics",
          });
        });

        it("calls save function on title update", async () => {
          const { onSave } = setup({ card });
          const title = screen.getByTestId("saved-question-header-title");
          await userEvent.clear(title);
          await userEvent.type(title, "New Title{enter}");
          expect(title).toHaveValue("New Title");
          title.blur();
          expect(onSave).toHaveBeenCalled();
        });

        it("shows bookmark and action buttons", () => {
          setup({ card });
          expect(
            screen.getByTestId("qb-header-info-button"),
          ).toBeInTheDocument();
        });
      });
    });
  });
});

describe("ViewHeader | Ad-hoc GUI question", () => {
  it("does not open details sidebar on table name click", async () => {
    const { question, onOpenModal } = setupAdHoc();
    const table = checkNotNull(
      question.metadata().table(Lib.sourceTableOrCardId(question.query())),
    );
    const tableName = table.displayName();

    fireEvent.click(await screen.findByText(tableName));

    expect(onOpenModal).not.toHaveBeenCalled();
  });

  it("does not render bookmark and action buttons", () => {
    setupAdHoc();
    expect(
      screen.queryByTestId("qb-header-info-button"),
    ).not.toBeInTheDocument();
  });

  describe("filters", () => {
    const card = getAdHocQuestionCard(FILTERED_GUI_QUESTION);

    it("shows all filters by default", () => {
      setup({ card, queryBuilderMode: "view" });
      expect(screen.getByText("Total is less than 50")).toBeInTheDocument();
      expect(screen.getByText("Tax is not empty")).toBeInTheDocument();
    });

    it("can collapse and expand filters", async () => {
      setup({ card, queryBuilderMode: "view" });

      fireEvent.click(screen.getByTestId("filters-visibility-control"));

      expect(
        screen.queryByText("Total is less than 50"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Tax is not empty")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("filters-visibility-control"));

      expect(screen.getByText("Total is less than 50")).toBeInTheDocument();
      expect(screen.getByText("Tax is not empty")).toBeInTheDocument();
    });

    it("does not show filters in notebook mode", () => {
      setup({ card, queryBuilderMode: "notebook" });

      expect(
        screen.queryByTestId("filters-visibility-control"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Total is less than 50"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Tax is not empty")).not.toBeInTheDocument();
    });

    it("hides the close notebook editor for brand new questions", () => {
      setup({
        card,
        queryBuilderMode: "notebook",
      });
      expect(screen.queryByLabelText("notebook icon")).not.toBeInTheDocument();
    });
  });
});

describe("View Header | Saved GUI question", () => {
  describe("filters", () => {
    const card = getSavedGUIQuestionCard(FILTERED_GUI_QUESTION);

    it("shows filters collapsed by default", () => {
      setup({ card, queryBuilderMode: "view" });

      expect(
        screen.getByTestId("filters-visibility-control"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Total is less than 50"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Tax is not empty")).not.toBeInTheDocument();
    });

    it("can collapse and expand filters", () => {
      setup({ card, queryBuilderMode: "view" });

      fireEvent.click(screen.getByTestId("filters-visibility-control"));

      expect(screen.getByText("Total is less than 50")).toBeInTheDocument();
      expect(screen.getByText("Tax is not empty")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("filters-visibility-control"));

      expect(
        screen.queryByText("Total is less than 50"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Tax is not empty")).not.toBeInTheDocument();
    });

    it("does not show filters in notebook mode", () => {
      setup({ card, queryBuilderMode: "notebook" });

      expect(
        screen.queryByTestId("filters-visibility-control"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Total is less than 50"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Tax is not empty")).not.toBeInTheDocument();
    });
  });
});

describe("View Header | native question without write permissions on database (eg user without self serve data permissions)", () => {
  const database = createSampleDatabase({ native_permissions: "none" });

  it("does not display question database", () => {
    const { question } = setupNative({ database });
    const databaseName = checkNotNull(question.database()).displayName();
    expect(screen.queryByText(databaseName)).not.toBeInTheDocument();
  });

  it("does not offer to explore query results", () => {
    setupNative({ database });
    expect(screen.queryByText("Explore results")).not.toBeInTheDocument();
  });
});

describe("View Header | Not saved native question", () => {
  it("does not display question database", () => {
    const { question } = setupNative();
    const databaseName = checkNotNull(question.database()).displayName();
    expect(screen.queryByText(databaseName)).not.toBeInTheDocument();
  });

  it("does not offer to explore query results", () => {
    setupNative();
    expect(screen.queryByText("Explore results")).not.toBeInTheDocument();
  });
});

describe("View Header | Saved native question", () => {
  it("displays database a question is using", () => {
    const { question } = setupSavedNative();
    const databaseName = checkNotNull(question.database()).displayName();
    expect(screen.getByText(databaseName)).toBeInTheDocument();
  });

  it("offers to explore query results", () => {
    setupSavedNative();
    expect(screen.getByText("Explore results")).toBeInTheDocument();
  });

  it("doesn't offer to explore results if nested queries are disabled", () => {
    setupSavedNative({ settings: { enableNestedQueries: false } });
    expect(screen.queryByText("Explore results")).not.toBeInTheDocument();
  });

  it("doesn't offer to explore results if the database doesn't support nested queries (metabase#22822)", () => {
    setupSavedNative({
      database: createSampleDatabase({
        features: _.without(COMMON_DATABASE_FEATURES, "nested-queries"),
      }),
    });
    expect(screen.queryByText("Explore results")).not.toBeInTheDocument();
  });
});

describe("View Header | Read only permissions", () => {
  it("should disable the input field for the question title", () => {
    setup({ card: getSavedGUIQuestionCard({ can_write: false }) });
    expect(screen.queryByTestId("saved-question-header-title")).toBeDisabled();
  });
});

describe("View Header | Hidden tables", () => {
  it("should show the View-only badge when the source table is hidden", async () => {
    setup({
      hideOrdersTable: true,
      card: getSavedGUIQuestionCard({ can_write: false }),
    });
    expect(await screen.findByText("View-only")).toBeInTheDocument();
  });

  it("should show the View-only badge when a joined table is hidden", async () => {
    setup({
      hideOrdersTable: true,
      card: getSavedGUIQuestionCard({
        can_write: false,
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
            joins: [
              {
                alias: "Orders",
                fields: "all",
                "source-table": ORDERS_ID,
                condition: [
                  "=",
                  ["field", PRODUCTS.ID, null],
                  ["field", ORDERS.PRODUCT_ID, null],
                ],
              },
            ],
          },
        },
      }),
    });
    expect(await screen.findByText("View-only")).toBeInTheDocument();
  });
});

describe("View Header | Inaccessible Cards", () => {
  it("should show the View-only badge when the source question is inaccessible", async () => {
    setup({
      card: getSavedGUIQuestionCard({
        can_write: false,
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": "card_123",
            joins: [
              {
                alias: "Orders",
                fields: "all",
                "source-table": ORDERS_ID,
                condition: [
                  "=",
                  ["field", PRODUCTS.ID, null],
                  ["field", ORDERS.PRODUCT_ID, null],
                ],
              },
            ],
          },
        },
      }),
    });
    expect(await screen.findByText("View-only")).toBeInTheDocument();
  });
});
