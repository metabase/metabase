import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";
import _ from "underscore";

import { createMockEntitiesState } from "__support__/store";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import MetabaseSettings from "metabase/lib/settings";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import { COMMON_DATABASE_FEATURES } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  SAMPLE_DB_ID,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { ViewTitleHeader } from "./ViewTitleHeader";

console.warn = jest.fn();

const BASE_GUI_QUESTION = {
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  },
};

const FILTERED_GUI_QUESTION = {
  ...BASE_GUI_QUESTION,
  dataset_query: {
    ...BASE_GUI_QUESTION.dataset_query,
    query: {
      ...BASE_GUI_QUESTION.dataset_query.query,
      filter: [
        "and",
        ["<", ["field", ORDERS.TOTAL, null], 50],
        ["not-null", ["field", ORDERS.TAX, null]],
      ],
    },
  },
};

const BASE_NATIVE_QUESTION = {
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "native",
    database: SAMPLE_DB_ID,
    native: {
      query: "select * from orders",
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

function getAdHocQuestionCard(overrides) {
  return { ...BASE_GUI_QUESTION, ...overrides };
}

function getNativeQuestionCard() {
  return BASE_NATIVE_QUESTION;
}

function getSavedGUIQuestionCard(overrides) {
  return { ...BASE_GUI_QUESTION, ...SAVED_QUESTION, ...overrides };
}

function getSavedNativeQuestionCard(overrides) {
  return {
    ...BASE_NATIVE_QUESTION,
    ...SAVED_QUESTION,
    ...overrides,
  };
}

function mockSettings({ enableNestedQueries = true } = {}) {
  MetabaseSettings.get = jest.fn().mockImplementation(key => {
    if (key === "enable-nested-queries") {
      return enableNestedQueries;
    }
    return false;
  });
}

function setup({
  card,
  database = createSampleDatabase(),
  settings,
  isActionListVisible = true,
  isAdditionalInfoVisible = true,
  isDirty = false,
  isRunnable = true,
  ...props
} = {}) {
  mockSettings(settings);

  const callbacks = {
    runQuestionQuery: jest.fn(),
    updateQuestion: jest.fn(),
    setQueryBuilderMode: jest.fn(),
    onOpenModal: jest.fn(),
    onAddFilter: jest.fn(),
    onCloseFilter: jest.fn(),
    onEditSummary: jest.fn(),
    onOpenQuestionInfo: jest.fn(),
    onCloseSummary: jest.fn(),
    onSave: jest.fn(),
  };

  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
      questions: [card],
    }),
  });

  const metadata = getMetadata(storeInitialState);
  const isSaved = card.id != null;
  const question = isSaved
    ? metadata.question(card.id)
    : new Question(card, metadata);

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <ViewTitleHeader
          isRunning={false}
          {...callbacks}
          {...props}
          question={question}
          isActionListVisible={isActionListVisible}
          isAdditionalInfoVisible={isAdditionalInfoVisible}
          isDirty={isDirty}
          isRunnable={isRunnable}
        />
      )}
    />,
    {
      withRouter: true,
      storeInitialState,
    },
  );

  return { question, ...callbacks };
}

function setupAdHoc(props = {}) {
  return setup({ card: getAdHocQuestionCard(), ...props });
}

function setupNative(props) {
  return setup({ card: getNativeQuestionCard(), ...props });
}

function setupSavedNative(props = {}) {
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
    ALL_TEST_CASES.forEach(testCase => {
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

        it("displays refresh button tooltip above the refresh button", async () => {
          setup({ card });
          const refreshButton = screen.getByLabelText("refresh icon");
          await userEvent.hover(refreshButton);
          const tooltip = screen.getByRole("tooltip");
          expect(tooltip).toHaveAttribute("data-placement", "top");
          expect(tooltip).toHaveTextContent("Refresh");
        });
      });
    });
  });

  describe("GUI", () => {
    GUI_TEST_CASES.forEach(testCase => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("displays database and table names", () => {
          setup({ card });

          expect(screen.getByText("Sample Database")).toBeInTheDocument();
          expect(screen.getByText("Orders")).toBeInTheDocument();
        });

        it("offers to filter query results", () => {
          const { onOpenModal } = setup({
            card,
            queryBuilderMode: "view",
          });
          fireEvent.click(screen.getByText("Filter"));
          expect(onOpenModal).toHaveBeenCalled();
        });

        it("offers to summarize query results", () => {
          const { onEditSummary } = setup({
            card,
            queryBuilderMode: "view",
          });
          fireEvent.click(screen.getByText("Summarize"));
          expect(onEditSummary).toHaveBeenCalled();
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
            result: { data: [] },
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
    NATIVE_TEST_CASES.forEach(testCase => {
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
    SAVED_QUESTIONS_TEST_CASES.forEach(testCase => {
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
  it("does not open details sidebar on table name click", () => {
    const { question, onOpenModal } = setupAdHoc();
    const tableName = question.legacyQueryTable().displayName();

    fireEvent.click(screen.getByText(tableName));

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
    const databaseName = question.database().displayName();
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
    const databaseName = question.database().displayName();
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
    const databaseName = question.database().displayName();
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
