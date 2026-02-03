/* eslint-disable react/display-name, react/prop-types */
import { Component } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCardEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { deserializeCardFromUrl } from "metabase/lib/card";
import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import * as ML_Urls from "metabase-lib/v1/urls";
import {
  createMockCard,
  createMockDatabase,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
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
const SOURCE_QUESTION_COLLECTION_SCHEMA_NAME = "Everything else";

// Factories

const ORDERS_TABLE = createOrdersTable();
const PRODUCTS_TABLE = createProductsTable();
const PEOPLE_TABLE = createPeopleTable();

const MULTI_SCHEMA_TABLE1 = createMockTable({
  id: MULTI_SCHEMA_TABLE1_ID,
  db_id: MULTI_SCHEMA_DB_ID,
  schema: "first_schema",
});

const MULTI_SCHEMA_TABLE2 = createMockTable({
  id: MULTI_SCHEMA_TABLE2_ID,
  db_id: MULTI_SCHEMA_DB_ID,
  schema: "second_schema",
});

function getMetadata() {
  return createMockMetadata({
    databases: [
      createSampleDatabase(),
      createMockDatabase({
        id: MULTI_SCHEMA_DB_ID,
        tables: [MULTI_SCHEMA_TABLE1, MULTI_SCHEMA_TABLE2],
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
  originalCard,
  subHead = false,
  isObjectDetail = false,
  hasPermissions = true,
} = {}) {
  const metadata = hasPermissions ? getMetadata() : createMockMetadata({});
  const question = card && new Question(card, metadata);
  const originalQuestion = originalCard && new Question(originalCard, metadata);

  setupCardEndpoints(SOURCE_CARD);
  setupTableEndpoints(ORDERS_TABLE);
  setupTableEndpoints(PRODUCTS_TABLE);
  setupTableEndpoints(PEOPLE_TABLE);
  setupTableEndpoints(MULTI_SCHEMA_TABLE1);
  setupTableEndpoints(MULTI_SCHEMA_TABLE2);

  const onError = jest.fn();
  renderWithProviders(
    <ErrorBoundary onError={onError}>
      <QuestionDataSource
        question={question}
        originalQuestion={originalQuestion}
        subHead={subHead}
        isObjectDetail={isObjectDetail}
      />
    </ErrorBoundary>,
  );
  return { onError, question };
}

jest.mock("metabase/common/components/Link", () => ({ to: href, ...props }) => (
  <a href={href} {...props} />
));

function getQuestionFromUrl(relativeUrl) {
  const url = new URL(relativeUrl, document.location.href);
  const card = deserializeCardFromUrl(url.hash);
  return new Question(card, getMetadata());
}

function areQuestionUrlsEquivalent(url1, url2) {
  return Lib.areLegacyQueriesEqual(
    getQuestionFromUrl(url1).datasetQuery(),
    getQuestionFromUrl(url2).datasetQuery(),
  );
}

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
    ALL_TEST_CASES.forEach((testCase) => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("displays database name", async () => {
          const { question } = setup({ card });
          const node = await screen.findByText(
            question.database().displayName(),
          );
          expect(node).toBeInTheDocument();
          expect(node.closest("a")).toHaveAttribute(
            "href",
            Urls.browseDatabase(question.database()),
          );
        });

        it("shows nothing if a user doesn't have data permissions", async () => {
          setup({ card, hasPermissions: false });
          expect(
            await screen.findByTestId("head-crumbs-container"),
          ).toBeEmptyDOMElement();
        });
      });
    });
  });

  describe("GUI", () => {
    Object.values(GUI_TEST_CASE).forEach((testCase) => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("displays table name", async () => {
          const { question } = setup({ card });
          const table = question
            .metadata()
            .table(Lib.sourceTableOrCardId(question.query()));
          const node = await screen.findByText(new RegExp(table.displayName()));
          expect(node).toBeInTheDocument();
          expect(node.closest("a")).not.toBeInTheDocument();
        });

        it("displays table link in subhead variant", async () => {
          const { question } = setup({ card, subHead: true });
          const table = question
            .metadata()
            .table(Lib.sourceTableOrCardId(question.query()));
          const node = await screen.findByText(new RegExp(table.displayName()));
          expect(
            areQuestionUrlsEquivalent(
              node.closest("a").href,
              ML_Urls.getUrl(table.newQuestion()),
            ),
          ).toBe(true);
        });

        it("displays table link in object detail view", async () => {
          const { question } = setup({ card, isObjectDetail: true });
          const table = question
            .metadata()
            .table(Lib.sourceTableOrCardId(question.query()));
          const node = await screen.findByText(new RegExp(table.displayName()));
          expect(
            areQuestionUrlsEquivalent(
              node.closest("a").href,
              ML_Urls.getUrl(table.newQuestion()),
            ),
          ).toBe(true);
        });
      });
    });
  });

  describe("GUI with schema", () => {
    [
      GUI_TEST_CASE.SAVED_GUI_MULTI_SCHEMA_DB,
      GUI_TEST_CASE.AD_HOC_MULTI_SCHEMA_DB,
    ].forEach((testCase) => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("displays schema name", async () => {
          const { question } = setup({ card });
          const table = question
            .metadata()
            .table(Lib.sourceTableOrCardId(question.query()));
          const node = await screen.findByText(table.schema_name);
          expect(node).toBeInTheDocument();
          expect(node.closest("a")).toHaveAttribute(
            "href",
            Urls.browseSchema(table),
          );
        });
      });
    });
  });

  describe("GUI with joins", () => {
    [
      GUI_TEST_CASE.SAVED_GUI_PRODUCTS_JOIN,
      GUI_TEST_CASE.AD_HOC_PRODUCTS_JOIN,
    ].forEach((testCase) => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("displays 2 joined tables (metabase#17961)", async () => {
          setup({ card, subHead: true });

          const orders = await screen.findByText(/Orders/);
          const products = await screen.findByText(/Products/);

          expect(orders).toBeInTheDocument();
          expect(
            areQuestionUrlsEquivalent(
              orders.closest("a").href,
              ML_Urls.getUrl(getAdHocOrdersQuestion()),
            ),
          ).toBe(true);
          expect(products).toBeInTheDocument();
          expect(
            areQuestionUrlsEquivalent(
              products.closest("a").href,
              ML_Urls.getUrl(getAdHocProductsQuestion()),
            ),
          ).toBe(true);
        });
      });
    });

    [
      GUI_TEST_CASE.SAVED_GUI_PRODUCTS_PEOPLE_JOIN,
      GUI_TEST_CASE.AD_HOC_PRODUCTS_PEOPLE_JOIN,
    ].forEach((testCase) => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("displays > 2 joined tables (metabase#17961)", async () => {
          setup({ card, subHead: true });

          const orders = await screen.findByText(/Orders/);
          const products = await screen.findByText(/Products/);
          const people = await screen.findByText(/People/);

          expect(orders).toBeInTheDocument();
          expect(
            areQuestionUrlsEquivalent(
              orders.closest("a").href,
              ML_Urls.getUrl(getAdHocOrdersQuestion()),
            ),
          ).toBe(true);
          expect(products).toBeInTheDocument();
          expect(
            areQuestionUrlsEquivalent(
              products.closest("a").href,
              ML_Urls.getUrl(getAdHocProductsQuestion()),
            ),
          ).toBe(true);
          expect(people).toBeInTheDocument();
          expect(
            areQuestionUrlsEquivalent(
              people.closest("a").href,
              ML_Urls.getUrl(getAdHocPeopleQuestion()),
            ),
          ).toBe(true);
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

    Object.values(NESTED_TEST_CASES).forEach((testCase) => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("does not display virtual schema (metabase#12616)", () => {
          setup({ card, subHead: true });

          const node = screen.queryByText(
            SOURCE_QUESTION_COLLECTION_SCHEMA_NAME,
          );
          expect(node).not.toBeInTheDocument();
        });
      });
    });
  });

  it("should show info icon on an ad-hoc question header", async () => {
    setup({ card: SOURCE_CARD });
    expect(await screen.findByLabelText("More info")).toBeInTheDocument();
  });

  it("should show info icon on a subheader", async () => {
    setup({ card: SOURCE_CARD, subHead: true });
    expect(screen.queryByLabelText("More info")).not.toBeInTheDocument();
  });

  it("should show the correct icon when the original question is a native query", () => {
    const metadataProvider = Lib.metadataProvider(
      SAMPLE_DB_ID,
      SAMPLE_METADATA,
    );
    const originalQuery = Lib.nativeQuery(
      SAMPLE_DB_ID,
      metadataProvider,
      "SELECT * FROM ORDERS",
    );
    const originalQuestion = Question.create()
      .setId(1)
      .setDisplayName("SQL query")
      .setQuery(originalQuery);
    const newMetadata = createMockMetadata({
      databases: [createSampleDatabase()],
      questions: [originalQuestion.card()],
    });
    const newMetadataProvider = Lib.metadataProvider(SAMPLE_DB_ID, newMetadata);
    const newQuery = Lib.queryFromTableOrCardMetadata(
      newMetadataProvider,
      Lib.tableOrCardMetadata(
        newMetadataProvider,
        getQuestionVirtualTableId(originalQuestion.id()),
      ),
    );
    const newQuestion = Question.create().setQuery(newQuery);
    setup({ card: newQuestion.card(), originalCard: originalQuestion.card() });
    expect(screen.getByText("SQL query")).toBeInTheDocument();
    expect(getIcon("table2")).toBeInTheDocument();
  });
});
