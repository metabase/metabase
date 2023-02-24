import React from "react";
import { Route } from "react-router";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import {
  SAMPLE_DATABASE,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";
import MetabaseSettings from "metabase/lib/settings";
import Question from "metabase-lib/Question";
import { ViewTitleHeader } from "./ViewHeader";

console.warn = jest.fn();

const BASE_GUI_QUESTION = {
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DATABASE.id,
    query: {
      "source-table": ORDERS.id,
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
        ["<", ["field", ORDERS.TOTAL.id, null], 50],
        ["not-null", ["field", ORDERS.TAX.id, null]],
      ],
    },
  },
};

const BASE_NATIVE_QUESTION = {
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "native",
    database: SAMPLE_DATABASE.id,
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

function getQuestion(card) {
  return new Question(card, metadata);
}

function getAdHocQuestion(overrides) {
  return getQuestion({ ...BASE_GUI_QUESTION, ...overrides });
}

function getNativeQuestion() {
  return getQuestion(BASE_NATIVE_QUESTION);
}

function getSavedGUIQuestion(overrides) {
  return getQuestion({ ...BASE_GUI_QUESTION, ...SAVED_QUESTION, ...overrides });
}

function getSavedNativeQuestion(overrides) {
  return getQuestion({
    ...BASE_NATIVE_QUESTION,
    ...SAVED_QUESTION,
    ...overrides,
  });
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
  question,
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
      withSampleDatabase: true,
    },
  );

  return { question, ...callbacks };
}

function setupAdHoc(props = {}) {
  return setup({ question: getAdHocQuestion(), ...props });
}

function setupNative(props) {
  return setup({ question: getNativeQuestion(), ...props });
}

function setupSavedNative(props = {}) {
  const collection = {
    id: "root",
    name: "Our analytics",
  };

  fetchMock.get("path:/api/collection/root", collection);

  const utils = setup({ question: getSavedNativeQuestion(), ...props });

  return {
    ...utils,
    collection,
  };
}

describe("ViewHeader", () => {
  const TEST_CASE = {
    SAVED_GUI_QUESTION: {
      question: getSavedGUIQuestion(),
      questionType: "saved GUI question",
    },
    AD_HOC_QUESTION: {
      question: getAdHocQuestion(),
      questionType: "ad-hoc GUI question",
    },
    NATIVE_QUESTION: {
      question: getNativeQuestion(),
      questionType: "not saved native question",
    },
    SAVED_NATIVE_QUESTION: {
      question: getSavedNativeQuestion(),
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
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("offers to save", () => {
          const { onOpenModal } = setup({ question, isDirty: true });
          fireEvent.click(screen.getByText("Save"));
          expect(onOpenModal).toHaveBeenCalledWith("save");
        });

        it("does not offer to save if it's not dirty", () => {
          setup({ question, isDirty: false });
          expect(screen.queryByText("Save")).not.toBeInTheDocument();
        });

        it("offers to refresh query results", () => {
          const { runQuestionQuery } = setup({ question });
          fireEvent.click(screen.getByLabelText("refresh icon"));
          expect(runQuestionQuery).toHaveBeenCalledWith({ ignoreCache: true });
        });

        it("does not offer to refresh query results if question is not runnable", () => {
          setup({ question, isRunnable: false });
          expect(
            screen.queryByLabelText("refresh icon"),
          ).not.toBeInTheDocument();
        });

        it("does not offer to modify a query when a user doesn't have data permissions", () => {
          const originalMethod = question.query().database;
          question.query().database = () => null;

          setup({ question });
          expect(screen.queryByText("Filter")).not.toBeInTheDocument();
          expect(
            screen.queryByLabelText("Show more filters"),
          ).not.toBeInTheDocument();
          expect(screen.queryByText("Summarize")).not.toBeInTheDocument();
          expect(
            screen.queryByLabelText("notebook icon"),
          ).not.toBeInTheDocument();
          expect(screen.getByLabelText("refresh icon")).toBeInTheDocument();

          question.query().database = originalMethod;
        });
      });
    });
  });

  describe("GUI", () => {
    GUI_TEST_CASES.forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("displays database and table names", () => {
          setup({ question });
          const databaseName = question.database().displayName();
          const tableName = question.table().displayName();

          expect(screen.getByText(databaseName)).toBeInTheDocument();
          expect(screen.getByText(tableName)).toBeInTheDocument();
        });

        it("offers to filter query results", () => {
          const { onOpenModal } = setup({
            question,
            queryBuilderMode: "view",
          });
          fireEvent.click(screen.getByText("Filter"));
          expect(onOpenModal).toHaveBeenCalled();
        });

        it("offers to summarize query results", () => {
          const { onEditSummary } = setup({
            question,
            queryBuilderMode: "view",
          });
          fireEvent.click(screen.getByText("Summarize"));
          expect(onEditSummary).toHaveBeenCalled();
        });

        it("allows to open notebook editor", () => {
          const { setQueryBuilderMode } = setup({
            question,
            queryBuilderMode: "view",
          });
          fireEvent.click(screen.getByLabelText("notebook icon"));
          expect(setQueryBuilderMode).toHaveBeenCalledWith("notebook");
        });

        it("allows to close notebook editor", () => {
          const { setQueryBuilderMode } = setup({
            question,
            queryBuilderMode: "notebook",
          });
          fireEvent.click(screen.getByLabelText("notebook icon"));
          expect(setQueryBuilderMode).toHaveBeenCalledWith("view");
        });

        it("does not offer to filter query results in notebook mode", () => {
          setup({ question, queryBuilderMode: "notebook" });
          expect(screen.queryByText("Filter")).not.toBeInTheDocument();
        });

        it("does not offer to filter query in detail view", () => {
          setup({ question, isObjectDetail: true });
          expect(screen.queryByText("Filter")).not.toBeInTheDocument();
        });

        it("does not offer to summarize query results in notebook mode", () => {
          setup({ question, queryBuilderMode: "notebook" });
          expect(screen.queryByText("Summarize")).not.toBeInTheDocument();
        });

        it("does not offer to summarize query in detail view", () => {
          setup({ question, isObjectDetail: true });
          expect(screen.queryByText("Summarize")).not.toBeInTheDocument();
        });
      });
    });
  });

  describe("Native", () => {
    NATIVE_TEST_CASES.forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("does not offer to filter query results", () => {
          setup({ question });
          expect(screen.queryByText("Filter")).not.toBeInTheDocument();
        });

        it("does not offer to summarize query results", () => {
          setup({ question });
          expect(screen.queryByText("Summarize")).not.toBeInTheDocument();
        });

        it("does not offer to refresh query results if native editor is open", () => {
          setup({ question, isNativeEditorOpen: true });
          expect(
            screen.queryByLabelText("refresh icon"),
          ).not.toBeInTheDocument();
        });
      });
    });
  });

  describe("Saved", () => {
    SAVED_QUESTIONS_TEST_CASES.forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        beforeEach(() => {
          fetchMock.get("path:/api/collection/root", {
            id: "root",
            name: "Our analytics",
          });
        });

        it("calls save function on title update", () => {
          const { onSave } = setup({ question });
          const title = screen.getByTestId("saved-question-header-title");
          userEvent.clear(title);
          userEvent.type(title, "New Title{enter}");
          expect(title).toHaveValue("New Title");
          title.blur();
          expect(onSave).toHaveBeenCalled();
        });

        it("shows bookmark and action buttons", () => {
          setup({ question });
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
    const tableName = question.table().displayName();

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
    const question = getAdHocQuestion(FILTERED_GUI_QUESTION);

    it("shows all filters by default", () => {
      setup({ question, queryBuilderMode: "view" });
      expect(screen.getByText("Total is less than 50")).toBeInTheDocument();
      expect(screen.getByText("Tax is not empty")).toBeInTheDocument();
    });

    it("can collapse and expand filters", () => {
      setup({ question, queryBuilderMode: "view" });

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
      setup({ question, queryBuilderMode: "notebook" });

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

describe("View Header | Saved GUI question", () => {
  describe("filters", () => {
    const question = getSavedGUIQuestion(FILTERED_GUI_QUESTION);

    it("shows filters collapsed by default", () => {
      setup({ question, queryBuilderMode: "view" });

      expect(
        screen.getByTestId("filters-visibility-control"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Total is less than 50"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Tax is not empty")).not.toBeInTheDocument();
    });

    it("can collapse and expand filters", () => {
      setup({ question, queryBuilderMode: "view" });

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
      setup({ question, queryBuilderMode: "notebook" });

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
  let originalNativePermissions;
  beforeEach(() => {
    setupNative();
    originalNativePermissions = SAMPLE_DATABASE.native_permissions;
    SAMPLE_DATABASE.native_permissions = "none";
  });

  afterEach(() => {
    SAMPLE_DATABASE.native_permissions = originalNativePermissions;
  });

  it("does not display question database", () => {
    const { question } = setupNative();
    const databaseName = question.database().displayName();
    expect(screen.queryByText(databaseName)).not.toBeInTheDocument();
  });

  it("does not offer to explore query results", () => {
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
    const originalDatabaseFeatures = SAMPLE_DATABASE.features;
    const nestedQueriesExcluded = originalDatabaseFeatures.filter(
      f => f !== "nested-queries",
    );
    SAMPLE_DATABASE.features = nestedQueriesExcluded;
    setupSavedNative();
    expect(screen.queryByText("Explore results")).not.toBeInTheDocument();
    SAMPLE_DATABASE.features = originalDatabaseFeatures;
  });
});

describe("View Header | Read only permissions", () => {
  it("should disable the input field for the question title", () => {
    setup({ question: getSavedGUIQuestion({ can_write: false }) });
    expect(screen.queryByTestId("saved-question-header-title")).toBeDisabled();
  });
});
