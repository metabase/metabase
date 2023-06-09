/* eslint-disable react/display-name, react/prop-types */
import { Component } from "react";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import {
  ORDERS_ID,
  ORDERS,
  SAMPLE_DB_ID,
  PRODUCTS,
  PEOPLE,
  PRODUCTS_ID,
  PEOPLE_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import Question from "metabase-lib/Question";
import * as ML_Urls from "metabase-lib/urls";
import QuestionDataSource from "./QuestionDataSource";

const MULTI_SCHEMA_DB_ID = 2;
const MULTI_SCHEMA_TABLE1_ID = 100;
const MULTI_SCHEMA_TABLE2_ID = 101;

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
};

const ORDERS_QUERY = {
  type: "query",
  database: SAMPLE_DB_ID,
  query: { "source-table": ORDERS_ID },
};

const PRODUCTS_QUERY = {
  type: "query",
  database: SAMPLE_DB_ID,
  query: { "source-table": PRODUCTS_ID },
};

const PEOPLE_QUERY = {
  type: "query",
  database: SAMPLE_DB_ID,
  query: { "source-table": PEOPLE_ID },
};

const QUERY_IN_MULTI_SCHEMA_DB = {
  type: "query",
  database: MULTI_SCHEMA_DB_ID,
  query: {
    "source-table": MULTI_SCHEMA_TABLE1_ID,
  },
};

// Joins

const ORDERS_PRODUCT_JOIN_CONDITION = [
  "=",
  ["field", ORDERS.PRODUCT_ID, null],
  ["field", PRODUCTS.ID, { "join-alias": "Products" }],
];

const ORDERS_PEOPLE_JOIN_CONDITION = [
  "=",
  ["field", ORDERS.USER_ID, null],
  ["field", PEOPLE.ID, { "join-alias": "People" }],
];

const PRODUCTS_JOIN = {
  alias: "Products",
  condition: ORDERS_PRODUCT_JOIN_CONDITION,
  "source-table": PRODUCTS_ID,
};

const PEOPLE_JOIN = {
  alias: "People",
  condition: ORDERS_PEOPLE_JOIN_CONDITION,
  "source-table": PEOPLE_ID,
};

const QUERY_WITH_PRODUCTS_JOIN = {
  type: "query",
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
    joins: [PRODUCTS_JOIN],
  },
};

const QUERY_WITH_PRODUCTS_PEOPLE_JOIN = {
  type: "query",
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
    joins: [PRODUCTS_JOIN, PEOPLE_JOIN],
  },
};

// Filters

const RANDOM_ORDER_ID = 155;
const ORDERS_PK_FILTER = ["=", ["field", ORDERS.ID, null], RANDOM_ORDER_ID];

const ORDER_DETAIL_QUERY = {
  type: "query",
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
    filter: ["and", ORDERS_PK_FILTER],
  },
};

// Nested query

const SOURCE_QUESTION_ID = 305;
const SOURCE_QUESTION_VIRTUAL_ID = `card__${SOURCE_QUESTION_ID}`;
const SOURCE_QUESTION_NAME = "Another saved question";
const SOURCE_QUESTION_COLLECTION_SCHEMA_NAME = "Everything else";

// Factories

function getMetadata() {
  return createMockMetadata({
    databases: [
      createSampleDatabase(),
      createMockDatabase({
        id: MULTI_SCHEMA_DB_ID,
        tables: [
          createMockTable({
            id: MULTI_SCHEMA_TABLE1_ID,
            db_id: MULTI_SCHEMA_DB_ID,
            schema: "first_schema",
          }),
          createMockTable({
            id: MULTI_SCHEMA_TABLE2_ID,
            db_id: MULTI_SCHEMA_DB_ID,
            schema: "second_schema",
          }),
        ],
      }),
    ],
  });
}

function getQuestion(card) {
  return new Question(card, getMetadata());
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

function getAdHocOrdersQuestion() {
  return getAdHocQuestion({ dataset_query: ORDERS_QUERY });
}

function getAdHocProductsQuestion() {
  return getAdHocQuestion({ dataset_query: PRODUCTS_QUERY });
}

function getAdHocPeopleQuestion() {
  return getAdHocQuestion({ dataset_query: PEOPLE_QUERY });
}

function getNestedQuestionTableMock(isMultiSchemaDB) {
  const dbId = isMultiSchemaDB ? MULTI_SCHEMA_DB_ID : SAMPLE_DB_ID;
  const metadata = getMetadata();

  return {
    id: SOURCE_QUESTION_VIRTUAL_ID,
    db: metadata.database(dbId),
    db_id: dbId,
    display_name: SOURCE_QUESTION_NAME,
    schema_name: SOURCE_QUESTION_COLLECTION_SCHEMA_NAME,
    schema: {
      id: `-1337:${SOURCE_QUESTION_COLLECTION_SCHEMA_NAME}`,
      name: SOURCE_QUESTION_COLLECTION_SCHEMA_NAME,
      database: {
        id: -1337,
        is_saved_questions: true,
      },
    },
    displayName: () => SOURCE_QUESTION_NAME,
    hasSchema: () => isMultiSchemaDB,
  };
}

function getAdHocNestedQuestion({ isMultiSchemaDB } = {}) {
  const dbId = isMultiSchemaDB ? MULTI_SCHEMA_DB_ID : SAMPLE_DB_ID;
  const question = getAdHocQuestion({
    dataset_query: {
      type: "query",
      database: dbId,
      query: {
        "source-table": SOURCE_QUESTION_VIRTUAL_ID,
      },
    },
  });

  question.query().table = () => getNestedQuestionTableMock(isMultiSchemaDB);

  return question;
}

function getSavedNestedQuestion({ isMultiSchemaDB } = {}) {
  const dbId = isMultiSchemaDB ? MULTI_SCHEMA_DB_ID : SAMPLE_DB_ID;
  const question = getSavedGUIQuestion({
    dataset_query: {
      type: "query",
      database: dbId,
      query: {
        "source-table": SOURCE_QUESTION_VIRTUAL_ID,
      },
    },
  });

  question.query().table = () => getNestedQuestionTableMock(isMultiSchemaDB);

  return question;
}

class ErrorBoundary extends Component {
  componentDidCatch(...args) {
    console.error(...args);
    this.props.onError();
  }

  render() {
    return this.props.children;
  }
}

function setup({ question, subHead = false, isObjectDetail = false } = {}) {
  const onError = jest.fn();
  renderWithProviders(
    <ErrorBoundary onError={onError}>
      <QuestionDataSource
        question={question}
        subHead={subHead}
        isObjectDetail={isObjectDetail}
      />
    </ErrorBoundary>,
  );
  return { onError };
}

jest.mock("metabase/core/components/Link", () => ({ to: href, ...props }) => (
  <a href={href} {...props} />
));

describe("QuestionDataSource", () => {
  const GUI_TEST_CASE = {
    SAVED_GUI_QUESTION: {
      question: getSavedGUIQuestion(),
      questionType: "saved GUI question",
    },
    AD_HOC_QUESTION: {
      question: getAdHocQuestion(),
      questionType: "ad-hoc GUI question",
    },
    SAVED_GUI_PRODUCTS_JOIN: {
      question: getSavedGUIQuestion({
        dataset_query: QUERY_WITH_PRODUCTS_JOIN,
      }),
      questionType: "saved GUI question joining a table",
    },
    AD_HOC_PRODUCTS_JOIN: {
      question: getAdHocQuestion({ dataset_query: QUERY_WITH_PRODUCTS_JOIN }),
      questionType: "ad-hoc GUI question joining a table",
    },
    SAVED_GUI_PRODUCTS_PEOPLE_JOIN: {
      question: getSavedGUIQuestion({
        dataset_query: QUERY_WITH_PRODUCTS_PEOPLE_JOIN,
      }),
      questionType: "saved GUI question joining a few tables",
    },
    AD_HOC_PRODUCTS_PEOPLE_JOIN: {
      question: getAdHocQuestion({
        dataset_query: QUERY_WITH_PRODUCTS_PEOPLE_JOIN,
      }),
      questionType: "ad-hoc GUI question joining a few tables",
    },
    SAVED_GUI_MULTI_SCHEMA_DB: {
      question: getSavedGUIQuestion({
        dataset_query: QUERY_IN_MULTI_SCHEMA_DB,
      }),
      questionType: "saved GUI question using multi-schema DB",
    },
    AD_HOC_MULTI_SCHEMA_DB: {
      question: getAdHocQuestion({ dataset_query: QUERY_IN_MULTI_SCHEMA_DB }),
      questionType: "ad-hoc GUI question using multi-schema DB",
    },
    SAVED_OBJECT_DETAIL: {
      question: getSavedGUIQuestion({ dataset_query: ORDER_DETAIL_QUERY }),
      questionType: "saved object detail",
    },
    AD_HOC_OBJECT_DETAIL: {
      question: getAdHocQuestion({ dataset_query: ORDER_DETAIL_QUERY }),
      questionType: "ad-hoc object detail",
    },
  };

  const GUI_TEST_CASES = Object.values(GUI_TEST_CASE);

  const NESTED_TEST_CASES = {
    SAVED: {
      question: getSavedNestedQuestion({ isMultiSchemaDB: false }),
      questionType: "saved nested question",
    },
    SAVED_MULTI_SCHEMA: {
      question: getSavedNestedQuestion({ isMultiSchemaDB: true }),
      questionType: "saved nested question using multi-schema DB",
    },
    AD_HOC: {
      question: getAdHocNestedQuestion({ isMultiSchemaDB: false }),
      questionType: "ad-hoc nested question",
    },
    AD_HOC_MULTI_SCHEMA: {
      question: getAdHocNestedQuestion({ isMultiSchemaDB: true }),
      questionType: "ad-hoc nested question using multi-schema DB",
    },
  };

  const ALL_TEST_CASES = [
    ...GUI_TEST_CASES,
    {
      question: getNativeQuestion(),
      questionType: "not saved native question",
    },
    {
      question: getSavedNativeQuestion(),
      questionType: "saved native question",
    },
  ];

  it("does not fail if question is not passed", () => {
    const { onError } = setup({ question: undefined });
    expect(onError).not.toHaveBeenCalled();
  });

  describe("common", () => {
    ALL_TEST_CASES.forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("displays database name", () => {
          setup({ question });
          const node = screen.queryByText(question.database().displayName());
          expect(node).toBeInTheDocument();
          expect(node.closest("a")).toHaveAttribute(
            "href",
            Urls.browseDatabase(question.database()),
          );
        });

        it("shows nothing if a user doesn't have data permissions", () => {
          const originalMethod = question.query().database;
          question.query().database = () => null;

          setup({ question });
          expect(
            screen.getByTestId("head-crumbs-container"),
          ).toBeEmptyDOMElement();

          question.query().database = originalMethod;
        });
      });
    });
  });

  describe("GUI", () => {
    Object.values(GUI_TEST_CASE).forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("displays table name", () => {
          setup({ question });
          const node = screen.queryByText(
            new RegExp(question.table().displayName()),
          );
          expect(node).toBeInTheDocument();
          expect(node.closest("a")).not.toBeInTheDocument();
        });

        it("displays table link in subhead variant", () => {
          setup({ question, subHead: true });
          const node = screen.queryByText(
            new RegExp(question.table().displayName()),
          );
          expect(node.closest("a")).toHaveAttribute(
            "href",
            ML_Urls.getUrl(question.table().newQuestion()),
          );
        });

        it("displays table link in object detail view", () => {
          setup({ question, isObjectDetail: true });
          const node = screen.queryByText(
            new RegExp(question.table().displayName()),
          );
          expect(node.closest("a")).toHaveAttribute(
            "href",
            ML_Urls.getUrl(question.table().newQuestion()),
          );
        });
      });
    });
  });

  describe("GUI with schema", () => {
    [
      GUI_TEST_CASE.SAVED_GUI_MULTI_SCHEMA_DB,
      GUI_TEST_CASE.AD_HOC_MULTI_SCHEMA_DB,
    ].forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("displays schema name", () => {
          setup({ question });
          const node = screen.queryByText(question.table().schema_name);
          expect(node).toBeInTheDocument();
          expect(node.closest("a")).toHaveAttribute(
            "href",
            Urls.browseSchema(question.table()),
          );
        });
      });
    });
  });

  describe("GUI with joins", () => {
    [
      GUI_TEST_CASE.SAVED_GUI_PRODUCTS_JOIN,
      GUI_TEST_CASE.AD_HOC_PRODUCTS_JOIN,
    ].forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("displays 2 joined tables (metabase#17961)", () => {
          setup({ question, subHead: true });

          const orders = screen.queryByText(/Orders/);
          const products = screen.queryByText(/Products/);

          expect(orders).toBeInTheDocument();
          expect(orders.closest("a")).toHaveAttribute(
            "href",
            ML_Urls.getUrl(getAdHocOrdersQuestion()),
          );
          expect(products).toBeInTheDocument();
          expect(products.closest("a")).toHaveAttribute(
            "href",
            ML_Urls.getUrl(getAdHocProductsQuestion()),
          );
        });
      });
    });

    [
      GUI_TEST_CASE.SAVED_GUI_PRODUCTS_PEOPLE_JOIN,
      GUI_TEST_CASE.AD_HOC_PRODUCTS_PEOPLE_JOIN,
    ].forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("displays > 2 joined tables (metabase#17961)", () => {
          setup({ question, subHead: true });

          const orders = screen.queryByText(/Orders/);
          const products = screen.queryByText(/Products/);
          const people = screen.queryByText(/People/);

          expect(orders).toBeInTheDocument();
          expect(orders.closest("a")).toHaveAttribute(
            "href",
            ML_Urls.getUrl(getAdHocOrdersQuestion()),
          );
          expect(products).toBeInTheDocument();
          expect(products.closest("a")).toHaveAttribute(
            "href",
            ML_Urls.getUrl(getAdHocProductsQuestion()),
          );
          expect(people).toBeInTheDocument();
          expect(people.closest("a")).toHaveAttribute(
            "href",
            ML_Urls.getUrl(getAdHocPeopleQuestion()),
          );
        });
      });
    });
  });

  // Enable when HTTP requests mocking is more reliable than xhr-mock
  describe("Nested", () => {
    Object.values(NESTED_TEST_CASES).forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("does not display virtual schema (metabase#12616)", () => {
          setup({ question, subHead: true });
          const node = screen.queryByText(
            SOURCE_QUESTION_COLLECTION_SCHEMA_NAME,
          );
          expect(node).not.toBeInTheDocument();
        });
      });
    });
  });
});
