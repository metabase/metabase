/* eslint-disable react/display-name, react/prop-types */
import { Component } from "react";

import { createMockMetadata } from "__support__/metadata";
import { setupCardEndpoints } from "__support__/server-mocks/card";
import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import Question from "metabase-lib/v1/Question";
import * as ML_Urls from "metabase-lib/v1/urls";
import {
  createMockCard,
  createMockDatabase,
  createMockTable,
} from "metabase-types/api/mocks";
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

import { QuestionDataSource } from "./QuestionDataSource";

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

function getQuestion(card, metadata) {
  return new Question(card, metadata);
}

function getAdHocQuestion(overrides) {
  return getQuestion({ ...BASE_GUI_QUESTION, ...overrides });
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

class ErrorBoundary extends Component {
  componentDidCatch(...args) {
    console.error(...args);
    this.props.onError();
  }

  render() {
    return this.props.children;
  }
}
const SOURCE_CARD = createMockCard({ id: SOURCE_QUESTION_ID });

function setup({
  card,
  subHead = false,
  isObjectDetail = false,
  hasPermissions = true,
} = {}) {
  const metadata = hasPermissions ? getMetadata() : createMockMetadata({});
  const question = card && new Question(card, metadata);

  setupCardEndpoints(SOURCE_CARD);

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
  return { onError, question };
}

jest.mock("metabase/core/components/Link", () => ({ to: href, ...props }) => (
  <a href={href} {...props} />
));

describe("QuestionDataSource", () => {
  const GUI_TEST_CASE = {
    SAVED_GUI_QUESTION: {
      card: { ...BASE_GUI_QUESTION, ...SAVED_QUESTION },
      questionType: "saved GUI question",
    },
    AD_HOC_QUESTION: {
      card: BASE_GUI_QUESTION,
      questionType: "ad-hoc GUI question",
    },
    SAVED_GUI_PRODUCTS_JOIN: {
      card: {
        ...BASE_GUI_QUESTION,
        ...SAVED_QUESTION,
        dataset_query: QUERY_WITH_PRODUCTS_JOIN,
      },
      questionType: "saved GUI question joining a table",
    },
    AD_HOC_PRODUCTS_JOIN: {
      card: { ...BASE_GUI_QUESTION, dataset_query: QUERY_WITH_PRODUCTS_JOIN },
      questionType: "ad-hoc GUI question joining a table",
    },
    SAVED_GUI_PRODUCTS_PEOPLE_JOIN: {
      card: {
        ...BASE_GUI_QUESTION,
        ...SAVED_QUESTION,
        dataset_query: QUERY_WITH_PRODUCTS_PEOPLE_JOIN,
      },
      questionType: "saved GUI question joining a few tables",
    },
    AD_HOC_PRODUCTS_PEOPLE_JOIN: {
      card: {
        ...BASE_GUI_QUESTION,
        dataset_query: QUERY_WITH_PRODUCTS_PEOPLE_JOIN,
      },
      questionType: "ad-hoc GUI question joining a few tables",
    },
    SAVED_GUI_MULTI_SCHEMA_DB: {
      card: {
        ...BASE_GUI_QUESTION,
        ...SAVED_QUESTION,
        dataset_query: QUERY_IN_MULTI_SCHEMA_DB,
      },
      questionType: "saved GUI question using multi-schema DB",
    },
    AD_HOC_MULTI_SCHEMA_DB: {
      card: {
        ...BASE_GUI_QUESTION,
        dataset_query: QUERY_IN_MULTI_SCHEMA_DB,
      },
      questionType: "ad-hoc GUI question using multi-schema DB",
    },
    SAVED_OBJECT_DETAIL: {
      card: {
        ...BASE_GUI_QUESTION,
        ...SAVED_QUESTION,
        dataset_query: ORDER_DETAIL_QUERY,
      },
      questionType: "saved object detail",
    },
    AD_HOC_OBJECT_DETAIL: {
      card: { ...BASE_GUI_QUESTION, dataset_query: ORDER_DETAIL_QUERY },
      questionType: "ad-hoc object detail",
    },
  };

  const GUI_TEST_CASES = Object.values(GUI_TEST_CASE);

  const ALL_TEST_CASES = [
    ...GUI_TEST_CASES,
    {
      card: BASE_NATIVE_QUESTION,
      questionType: "not saved native question",
    },
    {
      card: { ...BASE_NATIVE_QUESTION, ...SAVED_QUESTION },
      questionType: "saved native question",
    },
  ];

  it("does not fail if question is not passed", () => {
    const { onError } = setup();
    expect(onError).not.toHaveBeenCalled();
  });

  describe("common", () => {
    ALL_TEST_CASES.forEach(testCase => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("displays database name", () => {
          const { question } = setup({ card });
          const node = screen.queryByText(question.database().displayName());
          expect(node).toBeInTheDocument();
          expect(node.closest("a")).toHaveAttribute(
            "href",
            Urls.browseDatabase(question.database()),
          );
        });

        it("shows nothing if a user doesn't have data permissions", () => {
          setup({ card, hasPermissions: false });
          expect(
            screen.getByTestId("head-crumbs-container"),
          ).toBeEmptyDOMElement();
        });
      });
    });
  });

  describe("GUI", () => {
    Object.values(GUI_TEST_CASE).forEach(testCase => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("displays table name", () => {
          const { question } = setup({ card });
          const node = screen.queryByText(
            new RegExp(question.legacyQueryTable().displayName()),
          );
          expect(node).toBeInTheDocument();
          expect(node.closest("a")).not.toBeInTheDocument();
        });

        it("displays table link in subhead variant", () => {
          const { question } = setup({ card, subHead: true });
          const node = screen.queryByText(
            new RegExp(question.legacyQueryTable().displayName()),
          );
          expect(node.closest("a")).toHaveAttribute(
            "href",
            ML_Urls.getUrl(question.legacyQueryTable().newQuestion()),
          );
        });

        it("displays table link in object detail view", () => {
          const { question } = setup({ card, isObjectDetail: true });
          const node = screen.queryByText(
            new RegExp(question.legacyQueryTable().displayName()),
          );
          expect(node.closest("a")).toHaveAttribute(
            "href",
            ML_Urls.getUrl(question.legacyQueryTable().newQuestion()),
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
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("displays schema name", () => {
          const { question } = setup({ card });
          const node = screen.queryByText(
            question.legacyQueryTable().schema_name,
          );
          expect(node).toBeInTheDocument();
          expect(node.closest("a")).toHaveAttribute(
            "href",
            Urls.browseSchema(question.legacyQueryTable()),
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
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("displays 2 joined tables (metabase#17961)", () => {
          setup({ card, subHead: true });

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
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("displays > 2 joined tables (metabase#17961)", () => {
          setup({ card, subHead: true });

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

  describe("Nested", () => {
    const NESTED_QUESTION = {
      ...BASE_GUI_QUESTION,
      dataset_query: {
        ...BASE_GUI_QUESTION.dataset_query,
        query: {
          "source-table": SOURCE_QUESTION_VIRTUAL_ID,
        },
      },
    };

    const SAVED_NESTED_QUESTION = {
      ...NESTED_QUESTION,
      ...SAVED_QUESTION,
    };

    const NESTED_TEST_CASES = {
      SAVED: {
        card: SAVED_NESTED_QUESTION,
        questionType: "saved nested question",
      },
      SAVED_MULTI_SCHEMA: {
        card: {
          ...SAVED_NESTED_QUESTION,
          dataset_query: {
            ...SAVED_NESTED_QUESTION.dataset_query,
            database: MULTI_SCHEMA_DB_ID,
          },
        },
        questionType: "saved nested question using multi-schema DB",
      },
      AD_HOC: {
        card: NESTED_QUESTION,
        questionType: "ad-hoc nested question",
      },
      AD_HOC_MULTI_SCHEMA: {
        card: {
          ...NESTED_QUESTION,
          dataset_query: {
            ...NESTED_QUESTION.dataset_query,
            database: MULTI_SCHEMA_DB_ID,
          },
        },
        questionType: "ad-hoc nested question using multi-schema DB",
      },
    };

    Object.values(NESTED_TEST_CASES).forEach(testCase => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("does not display virtual schema (metabase#12616)", () => {
          const { question } = setup({ card, subHead: true });

          const isMultiSchemaDB =
            card.dataset_query.database === MULTI_SCHEMA_DB_ID;

          question.legacyQuery({ useStructuredQuery: true }).table = () =>
            getNestedQuestionTableMock(isMultiSchemaDB);

          const node = screen.queryByText(
            SOURCE_QUESTION_COLLECTION_SCHEMA_NAME,
          );
          expect(node).not.toBeInTheDocument();
        });
      });
    });
  });

  it("should show info icon on an ad-hoc question header", () => {
    setup({ card: SOURCE_CARD });
    expect(screen.getByLabelText("More info")).toBeInTheDocument();
  });

  it("should show info icon on a subheader", () => {
    setup({ card: SOURCE_CARD, subHead: true });
    expect(screen.queryByLabelText("More info")).not.toBeInTheDocument();
  });
});
