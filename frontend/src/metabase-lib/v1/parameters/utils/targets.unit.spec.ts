import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  createQueryWithClauses,
  getJoinQueryHelpers,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import {
  getParameterColumns,
  getParameterTargetField,
  getTemplateTagFromTarget,
  getTextTagFromTarget,
  isParameterVariableTarget,
} from "metabase-lib/v1/parameters/utils/targets";
import type {
  Card,
  ParameterDimensionTarget,
  StructuredDatasetQuery,
} from "metabase-types/api";
import {
  createMockCard,
  createMockField,
  createMockParameter,
  createMockSavedQuestionsDatabase,
  createMockTable,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS_ID,
  SAMPLE_DB_ID,
  createOrdersCreatedAtField,
  createOrdersQuantityField,
  createOrdersTable,
  createProductsCreatedAtField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isDimensionTarget } from "metabase-types/guards";

type StructuredCard = Card<StructuredDatasetQuery>;

const sampleDb = createSampleDatabase();
const savedQuestionsDb = createMockSavedQuestionsDatabase();

const metadata = createMockMetadata({
  databases: [sampleDb, savedQuestionsDb],
});

const db = metadata.database(SAMPLE_DB_ID) as Database;
const productsTable = metadata.table(PRODUCTS_ID) as Table;

const queryOrders = createQuery();

const queryNonDateBreakout = createQueryWithClauses({
  aggregations: [{ operatorName: "count" }],
  breakouts: [{ tableName: "ORDERS", columnName: "QUANTITY" }],
});

const query1DateBreakout = createQueryWithClauses({
  aggregations: [{ operatorName: "count" }],
  breakouts: [
    {
      tableName: "ORDERS",
      columnName: "CREATED_AT",
      temporalBucketName: "Month",
    },
  ],
});

const query2DateBreakouts = createQueryWithClauses({
  aggregations: [{ operatorName: "count" }],
  breakouts: [
    {
      tableName: "ORDERS",
      columnName: "CREATED_AT",
      temporalBucketName: "Month",
    },
    {
      tableName: "PRODUCTS",
      columnName: "CREATED_AT",
      temporalBucketName: "Month",
    },
  ],
});

const queryDateBreakoutsMultiStage = createQueryWithClauses({
  query: Lib.appendStage(
    createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        {
          tableName: "ORDERS",
          columnName: "CREATED_AT",
          temporalBucketName: "Month",
        },
      ],
    }),
  ),
  aggregations: [{ operatorName: "count" }],
  breakouts: [
    {
      tableName: "ORDERS",
      columnName: "CREATED_AT",
      temporalBucketName: "Year",
    },
  ],
});

const ordersColumns = [
  ["Orders", "Created At"],
  ["Orders", "Discount"],
  ["Orders", "ID"],
  ["Orders", "Product ID"],
  ["Orders", "Quantity"],
  ["Orders", "Subtotal"],
  ["Orders", "Tax"],
  ["Orders", "Total"],
  ["Orders", "User ID"],
];

const productsColumns = [
  ["Products", "Product → Category"],
  ["Products", "Product → Created At"],
  ["Products", "Product → Ean"],
  ["Products", "Product → ID"],
  ["Products", "Product → Price"],
  ["Products", "Product → Rating"],
  ["Products", "Product → Title"],
  ["Products", "Product → Vendor"],
];

const peopleColumns = [
  ["People", "User → Address"],
  ["People", "User → Birth Date"],
  ["People", "User → City"],
  ["People", "User → Created At"],
  ["People", "User → Email"],
  ["People", "User → ID"],
  ["People", "User → Latitude"],
  ["People", "User → Longitude"],
  ["People", "User → Name"],
  ["People", "User → Password"],
  ["People", "User → Source"],
  ["People", "User → State"],
  ["People", "User → Zip"],
];

const reviewsJoinProductsColumns = [
  ["Reviews", "Reviews - Product → Body"],
  ["Reviews", "Reviews - Product → Created At"],
  ["Reviews", "Reviews - Product → ID"],
  ["Reviews", "Reviews - Product → Product ID"],
  ["Reviews", "Reviews - Product → Rating"],
  ["Reviews", "Reviews - Product → Reviewer"],
];

describe("parameters/utils/targets", () => {
  describe("isDimensionTarget", () => {
    it("should return false for non-dimension targets", () => {
      expect(isDimensionTarget(["variable", ["template-tag", "foo"]])).toBe(
        false,
      );
    });

    it('should return true for a target that contains a "dimension" string in the first entry', () => {
      expect(isDimensionTarget(["dimension", ["field", 1, null]])).toBe(true);
      expect(isDimensionTarget(["dimension", ["template-tag", "foo"]])).toBe(
        true,
      );
    });
  });

  describe("isVariableTarget", () => {
    it("should return false for non-variable targets", () => {
      expect(isParameterVariableTarget(["dimension", ["field", 1, null]])).toBe(
        false,
      );
      expect(
        isParameterVariableTarget(["dimension", ["template-tag", "foo"]]),
      ).toBe(false);
    });

    it("should return true for a variable target", () => {
      expect(
        isParameterVariableTarget(["variable", ["template-tag", "foo"]]),
      ).toBe(true);
    });
  });

  describe("getTemplateTagFromTarget", () => {
    it("should return the tag of a template tag target", () => {
      expect(
        getTemplateTagFromTarget(["variable", ["template-tag", "foo"]]),
      ).toBe("foo");
      expect(
        getTemplateTagFromTarget(["dimension", ["template-tag", "bar"]]),
      ).toBe("bar");
    });

    it("should return null for targets that are not template tags", () => {
      expect(
        getTemplateTagFromTarget(["dimension", ["field", 123, null]]),
      ).toBe(null);
    });
  });

  describe("getTextTagFromTarget", () => {
    it("should return the tag of a text tag target", () => {
      expect(getTextTagFromTarget(["text-tag", "foo"])).toBe("foo");
    });

    it("should return null for targets that are not text tags", () => {
      expect(getTextTagFromTarget(["dimension", ["field", 123, null]])).toBe(
        null,
      );
    });
  });

  describe("getParameterTargetField", () => {
    it("should return null when the target is not a dimension", () => {
      const question = db.nativeQuestion({
        query: "select * from PRODUCTS where CATEGORY = {{foo}}",
        "template-tags": {
          foo: createMockTemplateTag({
            type: "text",
          }),
        },
      });
      const parameter = createMockParameter();

      expect(
        getParameterTargetField(question, parameter, [
          "variable",
          ["template-tag", "foo"],
        ]),
      ).toBe(null);
    });

    it("should return the mapped field behind a template tag field filter", () => {
      const target: ParameterDimensionTarget = [
        "dimension",
        ["template-tag", "foo"],
      ];
      const question = db.nativeQuestion({
        query: "select * from PRODUCTS where {{foo}}",
        "template-tags": {
          foo: createMockTemplateTag({
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
          }),
        },
      });
      const parameter = createMockParameter();

      expect(getParameterTargetField(question, parameter, target)).toEqual(
        expect.objectContaining({
          id: PRODUCTS.CATEGORY,
        }),
      );
    });

    it("should return the target field", () => {
      const question = productsTable.question();
      const parameter = createMockParameter();
      const target: ParameterDimensionTarget = [
        "dimension",
        ["field", PRODUCTS.CATEGORY, null],
      ];
      expect(getParameterTargetField(question, parameter, target)).toEqual(
        expect.objectContaining({
          id: PRODUCTS.CATEGORY,
        }),
      );
    });
  });

  describe("getParameterColumns", () => {
    describe("no parameter", () => {
      const parameter = undefined;

      describe("question", () => {
        it("returns columns from source table and implicitly joinable tables", () => {
          const question = createQuestion(queryOrders);
          const { query, columns } = getParameterColumns(question, parameter);
          const columnsInfos = getColumnsInfos(query, columns);

          expect(columnsInfos).toEqual(
            withColumnsStage(0, [
              ...ordersColumns,
              ...productsColumns,
              ...peopleColumns,
            ]),
          );
        });

        it("complex 1-stage query", () => {
          const question = createQuestion(createComplex1StageQuery());
          const { query, columns } = getParameterColumns(question, parameter);
          const columnsInfos = getColumnsInfos(query, columns);

          expect(columnsInfos).toEqual([
            ...withColumnsStage(0, ordersColumns),
            withColumnStage(0, [undefined, "User's 18th birthday"]),
            ...withColumnsStage(0, reviewsJoinProductsColumns),
            ...withColumnsStage(0, productsColumns),
            ...withColumnsStage(0, peopleColumns),
            ...withColumnsStage(0, productsColumns),
            ...withColumnsStage(1, [
              ["Orders", "Created At: Month"],
              ["Products", "Product → Created At: Year"],
              ["Reviews", "Reviews - Product → Created At: Quarter"],
              [undefined, "User's 18th birthday"],
              [undefined, "Count"],
              [undefined, "Sum of Total"],
            ]),
          ]);
        });

        // eslint-disable-next-line jest/no-disabled-tests
        it.skip("complex 2-stage query", () => {
          const question = createQuestion(createComplex2StageQuery());
          const { query, columns } = getParameterColumns(question, parameter);
          const columnsInfos = getColumnsInfos(query, columns);

          expect(columnsInfos).toEqual([
            ...withColumnsStage(0, ordersColumns),
            withColumnStage(0, [undefined, "User's 18th birthday"]),
            ...withColumnsStage(0, reviewsJoinProductsColumns),
            ...withColumnsStage(0, productsColumns),
            ...withColumnsStage(0, peopleColumns),
            ...withColumnsStage(0, productsColumns),
            ...withColumnsStage(1, [
              ["Orders", "Created At: Month"],
              ["Products", "Product → Created At: Year"],
              ["Reviews", "Reviews - Product → Created At: Quarter"],
              [undefined, "User's 18th birthday"],
              [undefined, "Count"],
              [undefined, "Sum of Total"],
            ]),
            withColumnStage(1, [undefined, "Count + 1"]),
            ...withColumnsStage(1, [
              ["Reviews", "Reviews - Created At: Quarter → Body"],
              ["Reviews", "Reviews - Created At: Quarter → Created At"],
              ["Reviews", "Reviews - Created At: Quarter → ID"],
              ["Reviews", "Reviews - Created At: Quarter → Product ID"],
              ["Reviews", "Reviews - Created At: Quarter → Rating"],
              ["Reviews", "Reviews - Created At: Quarter → Reviewer"],
            ]),
            withColumnStage(2, [undefined, "User's 18th birthday"]),
            withColumnStage(2, [undefined, "Count"]),
          ]);
        });
      });

      describe("model", () => {
        it("returns columns from source table and implicitly joinable tables", () => {
          const question = createModel(
            queryOrders,
            checkNotNull(createOrdersTable().fields),
          );
          const { query, columns } = getParameterColumns(question, parameter);
          const columnsInfos = getColumnsInfos(query, columns);

          expect(columnsInfos).toEqual(
            withColumnsStage(0, [
              ["Question", "ID"],
              ["Question", "User ID"],
              ["Question", "Product ID"],
              ["Question", "Subtotal"],
              ["Question", "Tax"],
              ["Question", "Total"],
              ["Question", "Discount"],
              ["Question", "Created At"],
              ["Question", "Quantity"],
              ...productsColumns,
              ...peopleColumns,
            ]),
          );
        });

        it("complex 1-stage query", () => {
          const question = createModel(createComplex1StageQuery(), [
            createMockField({ display_name: "Created At" }),
            createMockField({ display_name: "User's 18th birthday" }),
            createMockField({ display_name: "Reviews - Product → Created At" }),
            createMockField({ display_name: "Product → Created At" }),
            createMockField({ display_name: "Count" }),
            createMockField({ display_name: "Sum of Total" }),
          ]);
          const { query, columns } = getParameterColumns(question, parameter);
          const columnsInfos = getColumnsInfos(query, columns);

          expect(columnsInfos).toEqual([
            ...withColumnsStage(0, [
              ["Question", "Created At"],
              ["Question", "User's 18th birthday"],
              ["Question", "Reviews - Product → Created At"],
              ["Question", "Product → Created At"],
              ["Question", "Count"],
              ["Question", "Sum of Total"],
            ]),
          ]);
        });

        it("complex 2-stage query", () => {
          const question = createModel(createComplex2StageQuery(), [
            createMockField({ display_name: "User's 18th birthday" }),
            createMockField({ display_name: "Count" }),
          ]);
          const { query, columns } = getParameterColumns(question, parameter);
          const columnsInfos = getColumnsInfos(query, columns);

          expect(columnsInfos).toEqual([
            withColumnStage(0, ["Question", "User's 18th birthday"]),
            withColumnStage(0, ["Question", "Count"]),
          ]);
        });
      });
    });

    describe("unit of time parameter", () => {
      const parameter = createUnitOfTimeParameter();

      describe("question", () => {
        it("no breakouts - returns no columns", () => {
          const question = createQuestion(queryOrders);
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("non-date breakout - returns no columns", () => {
          const question = createQuestion(queryNonDateBreakout);
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("1 date breakout - returns 1 date column", () => {
          const question = createQuestion(query1DateBreakout);
          const { query, columns } = getParameterColumns(question, parameter);
          const columnsInfos = getColumnsInfos(query, columns);

          expect(columnsInfos).toEqual(
            withColumnsStage(0, [["Orders", "Created At: Month"]]),
          );
        });

        it("2 date breakouts - returns 2 date columns", () => {
          const question = createQuestion(query2DateBreakouts);
          const { query, columns } = getParameterColumns(question, parameter);
          const columnsInfos = getColumnsInfos(query, columns);

          expect(columnsInfos).toEqual(
            withColumnsStage(0, [
              ["Orders", "Created At: Month"],
              ["Products", "Product → Created At: Month"],
            ]),
          );
        });

        // eslint-disable-next-line jest/no-disabled-tests
        it.skip("date breakouts in multiple stages - returns date column from the last stage only", () => {
          const question = createQuestion(queryDateBreakoutsMultiStage);
          const { query, columns } = getParameterColumns(question, parameter);
          const columnsInfos = getColumnsInfos(query, columns);

          expect(columnsInfos).toEqual(
            withColumnsStage(1, [["Orders", "Created At: Month"]]),
          );
        });
      });

      describe("model", () => {
        it("no breakouts - returns no columns", () => {
          const question = createModel(
            queryOrders,
            checkNotNull(createOrdersTable().fields),
          );
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("non-date breakout - returns no columns", () => {
          const question = createModel(queryNonDateBreakout, [
            createOrdersQuantityField(),
            createMockField({ display_name: "Count" }),
          ]);
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("1 date breakout - returns 1 date column", () => {
          const question = createModel(query1DateBreakout, [
            createOrdersCreatedAtField(),
            createMockField({ display_name: "Count" }),
          ]);
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("2 date breakouts - returns 2 date columns", () => {
          const question = createModel(query2DateBreakouts, [
            createOrdersCreatedAtField(),
            createProductsCreatedAtField(),
            createMockField({ display_name: "Count" }),
          ]);
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("date breakouts in multiple stages - returns date column from the last stage only", () => {
          const question = createModel(queryDateBreakoutsMultiStage, [
            createOrdersCreatedAtField(),
            createMockField({ display_name: "Count" }),
          ]);
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });
      });
    });

    describe("date parameter", () => {
      const parameter = createDateParameter();

      describe("question", () => {
        it("returns date columns from source table and implicitly joinable tables", () => {
          const question = createQuestion(queryOrders);
          const { query, columns } = getParameterColumns(question, parameter);
          const columnsInfos = getColumnsInfos(query, columns);

          expect(columnsInfos).toEqual(
            withColumnsStage(0, [
              ["Orders", "Created At"],
              ["Products", "Product → Created At"],
              ["People", "User → Birth Date"],
              ["People", "User → Created At"],
            ]),
          );
        });
      });

      describe("model", () => {
        it("returns date columns from source table and implicitly joinable tables", () => {
          const question = createModel(
            queryOrders,
            checkNotNull(createOrdersTable().fields),
          );
          const { query, columns } = getParameterColumns(question, parameter);
          const columnsInfos = getColumnsInfos(query, columns);

          expect(columnsInfos).toEqual(
            withColumnsStage(0, [
              ["Question", "Created At"],
              ["Products", "Product → Created At"],
              ["People", "User → Birth Date"],
              ["People", "User → Created At"],
            ]),
          );
        });
      });
    });
  });
});

function createComplex1StageQuery() {
  const baseQuery = ordersJoinReviewsOnProductId();
  const findColumn = columnFinder(baseQuery, Lib.visibleColumns(baseQuery, -1));
  const userBirthdayColumn = findColumn("PEOPLE", "BIRTH_DATE");

  return createQueryWithClauses({
    query: baseQuery,
    expressions: [
      {
        name: "User's 18th birthday",
        operator: "datetime-add",
        args: [checkNotNull(userBirthdayColumn), 18, "year"],
      },
    ],
    aggregations: [
      { operatorName: "count" },
      { operatorName: "sum", tableName: "ORDERS", columnName: "TOTAL" },
    ],
    breakouts: [
      {
        tableName: "ORDERS",
        columnName: "CREATED_AT",
        temporalBucketName: "Month",
      },
      {
        tableName: "PRODUCTS",
        columnName: "CREATED_AT",
        temporalBucketName: "Year",
      },
      {
        tableName: "REVIEWS",
        columnName: "CREATED_AT",
        temporalBucketName: "Quarter",
      },
      {
        columnName: "User's 18th birthday",
      },
    ],
  });
}

function createComplex2StageQuery() {
  const baseQuery = Lib.appendStage(createComplex1StageQuery());
  const findColumn = columnFinder(baseQuery, Lib.visibleColumns(baseQuery, -1));
  const countColumn = findColumn(null, "count");

  const stageIndex = -1;
  const {
    table,
    defaultStrategy,
    defaultOperator,
    findLHSColumn,
    findRHSColumn,
  } = getJoinQueryHelpers(baseQuery, stageIndex, REVIEWS_ID);

  const createdAt = findLHSColumn("ORDERS", "CREATED_AT");
  const reviewsCreatedAt = findRHSColumn("REVIEWS", "CREATED_AT");
  const condition = Lib.joinConditionClause(
    defaultOperator,
    reviewsCreatedAt,
    createdAt,
  );
  const join = Lib.joinClause(table, [condition], defaultStrategy);
  const queryWithJoin = Lib.join(baseQuery, stageIndex, join);

  return createQueryWithClauses({
    query: queryWithJoin,
    expressions: [
      {
        name: "Count + 1",
        operator: "+",
        args: [checkNotNull(countColumn), 1],
      },
    ],
    aggregations: [{ operatorName: "count" }],
    breakouts: [{ columnName: "User's 18th birthday" }],
  });
}

function ordersJoinReviewsOnProductId() {
  const stageIndex = -1;
  const {
    table,
    defaultStrategy,
    defaultOperator,
    findLHSColumn,
    findRHSColumn,
  } = getJoinQueryHelpers(queryOrders, stageIndex, REVIEWS_ID);

  const productsId = findLHSColumn("ORDERS", "PRODUCT_ID");
  const reviewsProductId = findRHSColumn("REVIEWS", "PRODUCT_ID");
  const condition = Lib.joinConditionClause(
    defaultOperator,
    reviewsProductId,
    productsId,
  );
  const join = Lib.joinClause(table, [condition], defaultStrategy);
  const query = Lib.join(queryOrders, stageIndex, join);

  return query;
}

function createUnitOfTimeParameter() {
  return createMockParameter({
    name: "Time grouping",
    slug: "unit_of_time",
    id: "49358513",
    type: "temporal-unit",
    sectionId: "temporal-unit",
  });
}

function createDateParameter() {
  return createMockParameter({
    name: "Date",
    slug: "date",
    id: "57ab6554",
    type: "date/all-options",
    sectionId: "date",
  });
}

function createQuestion(query: Lib.Query) {
  return new Question(createMockCard(), metadata).setQuery(query);
}

function createModel(
  query: Lib.Query,
  /* result_metadata needs to be passed, otherwise test setup would be incorrect */
  result_metadata: StructuredCard["result_metadata"],
) {
  const card = createMockCard({ type: "model", result_metadata });
  const metadata = createMockMetadata({
    databases: [sampleDb, savedQuestionsDb],
    tables: [getModelVirtualTable(card)],
    questions: [card],
  });

  return new Question(card, metadata).setQuery(query);
}

function getModelVirtualTable(card: Card) {
  return createMockTable({
    id: getQuestionVirtualTableId(card.id),
    db_id: savedQuestionsDb.id,
    name: card.name,
    display_name: card.name,
    fields: card.result_metadata ?? [],
  });
}

function getColumnsInfos(
  query: Lib.Query,
  columns: {
    stageIndex: number;
    column: Lib.ColumnMetadata;
    group: Lib.ColumnGroup;
  }[],
) {
  return columns.map(({ column, stageIndex }) => {
    const info = Lib.displayInfo(query, stageIndex, column);
    return [stageIndex, info.table?.displayName, info.longDisplayName];
  });
}

function withColumnsStage(
  stageIndex: number,
  columns: (string | undefined)[][],
) {
  return columns.map((column) => withColumnStage(stageIndex, column));
}

function withColumnStage(stageIndex: number, column: (string | undefined)[]) {
  return [stageIndex, ...column];
}
