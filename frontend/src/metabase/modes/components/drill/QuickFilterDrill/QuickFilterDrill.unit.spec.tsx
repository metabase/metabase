import React from "react";
import userEvent from "@testing-library/user-event";
import {
  metadata,
  ORDERS,
  PEOPLE,
  REVIEWS,
  SAMPLE_DATABASE,
} from "__support__/sample_database_fixture";
import { createMockColumn } from "metabase-types/api/mocks";
import {
  DatasetColumn,
  DimensionReference,
  RowValue,
  StructuredDatasetQuery,
} from "metabase-types/api";
import {
  PopoverClickAction,
  QuestionChangeClickAction,
} from "metabase/modes/types";
import { renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/Question";
import { getUnsavedNativeQuestion } from "metabase-lib/mocks";
import QuickFilterDrill from "./QuickFilterDrill";

const NUMBER_AND_DATE_FILTERS = [
  { name: "<", operator: "<", dateTitle: "Before" },
  { name: ">", operator: ">", dateTitle: "After" },
  { name: "=", operator: "=", dateTitle: "On" },
  { name: "≠", operator: "!=", dateTitle: "Not on" },
];

const NULL_FILTERS = [
  { name: "=", operator: "is-null" },
  { name: "≠", operator: "not-null" },
];

const LONG_TEXT_FILTERS = [
  { name: "contains", title: "Contains…", selectOptionTitle: "Contains" },
  {
    name: "does-not-contain",
    title: "Does not contain…",
    selectOptionTitle: "Does not contain",
  },
];

const OTHER_FILTERS = [
  { name: "=", operator: "=" },
  { name: "≠", operator: "!=" },
];

const DEFAULT_NUMERIC_CELL_VALUE = 42;

const AGGREGATED_QUERY = {
  aggregation: [["count"]],
  breakout: ["field", ORDERS.CREATED_AT.id, { "temporal-unit": "month" }],
  "source-table": ORDERS.id,
};

const AGGREGATED_QUESTION = {
  display: "table",
  dataset_query: {
    type: "query",
    query: AGGREGATED_QUERY,
    database: SAMPLE_DATABASE.id,
  },
};

const NESTED_QUESTION_SOURCE_TABLE_ID = "card__58";
const NESTED_QUESTION = {
  display: "table",
  dataset_query: {
    type: "query",
    query: {
      "source-table": NESTED_QUESTION_SOURCE_TABLE_ID,
    },
    database: SAMPLE_DATABASE.id,
  },
};

function setup({
  question = ORDERS.question(),
  column,
  value = DEFAULT_NUMERIC_CELL_VALUE,
}: {
  question?: Question;
  column?: DatasetColumn;
  value?: RowValue;
} = {}) {
  const actions = QuickFilterDrill({
    question,
    clicked: { column, value },
  }) as QuestionChangeClickAction[];

  return {
    actions,
    cellValue: value,
  };
}

describe("QuickFilterDrill", () => {
  it("should not be valid for top level actions", () => {
    const actions = QuickFilterDrill({ question: ORDERS.question() });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid for native questions", () => {
    const actions = QuickFilterDrill({
      question: getUnsavedNativeQuestion(),
      clicked: {
        column: createMockColumn({
          name: "TOTAL",
          field_ref: ["field", 6, { "base-type": "type/BigInteger" }],
          base_type: "type/BigInteger",
          source: "native",
        }),
      },
    });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid when clicked column is missing", () => {
    const { actions } = setup();
    expect(actions).toHaveLength(0);
  });

  it("should not be valid when clicked value is undefined", () => {
    const actions = QuickFilterDrill({
      question: ORDERS.question(),
      clicked: {
        column: ORDERS.TOTAL.column(),
        value: undefined,
      },
    });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid for PK cells", () => {
    const { actions } = setup({ column: ORDERS.ID.column() });
    expect(actions).toHaveLength(0);
  });

  describe("numeric cells", () => {
    const clickedField = ORDERS.TOTAL;
    const { actions } = setup({ column: clickedField.column() });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(
          (question.datasetQuery() as StructuredDatasetQuery).query,
        ).toEqual({
          "source-table": ORDERS.id,
          filter: [
            operator,
            clickedField.reference(),
            DEFAULT_NUMERIC_CELL_VALUE,
          ],
        });
        expect(question.display()).toBe("table");
      });
    });
  });

  describe("joined numeric field cell", () => {
    const joinedFieldRef = ["field", ORDERS.TOTAL.id, { "join-alias": "foo" }];
    const { actions, cellValue } = setup({
      column: ORDERS.TOTAL.column({ field_ref: joinedFieldRef }),
    });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(
          (question.datasetQuery() as StructuredDatasetQuery).query,
        ).toEqual({
          "source-table": ORDERS.id,
          filter: [operator, joinedFieldRef, cellValue],
        });
        expect(question.display()).toBe("table");
      });
    });
  });

  describe("aggregated numeric cell", () => {
    const { actions, cellValue } = setup({
      question: new Question(AGGREGATED_QUESTION, metadata),
      column: createMockColumn({
        name: "count",
        field_ref: ["aggregation", 0, null],
        base_type: "type/BigInteger",
        semantic_type: "type/Quantity",
        source: "aggregation",
      }),
    });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(
          (question.datasetQuery() as StructuredDatasetQuery).query,
        ).toEqual({
          "source-query": AGGREGATED_QUERY,
          filter: [
            operator,
            ["field", "count", { "base-type": "type/BigInteger" }],
            cellValue,
          ],
        });
        expect(question.display()).toBe("table");
      });
    });
  });

  describe("numeric field cell from a nested query", () => {
    const question = new Question(NESTED_QUESTION);
    question.query().isEditable = () => true;

    const fieldRef: DimensionReference = [
      "field",
      "count",
      { "base-type": "type/BigInteger" },
    ];
    const { actions, cellValue } = setup({
      question,
      column: createMockColumn({
        name: "count",
        field_ref: fieldRef,
        base_type: "type/BigInteger",
        semantic_type: "type/Quantity",
        source: "aggregation",
      }),
    });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(
          (question.datasetQuery() as StructuredDatasetQuery).query,
        ).toEqual({
          "source-table": NESTED_QUESTION_SOURCE_TABLE_ID,
          filter: [operator, fieldRef, cellValue],
        });
        expect(question.display()).toBe("table");
      });
    });
  });

  describe("numeric cells with null values", () => {
    const clickedField = ORDERS.TOTAL;
    const { actions } = setup({ column: clickedField.column(), value: null });

    it("should return correct filters", () => {
      const filters = NULL_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = NULL_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(
          (question.datasetQuery() as StructuredDatasetQuery).query,
        ).toEqual({
          "source-table": ORDERS.id,
          filter: [operator, clickedField.reference()],
        });
        expect(question.display()).toBe("table");
      });
    });
  });

  describe("date-time cells", () => {
    const CELL_VALUE = new Date().toISOString();
    const { actions } = setup({
      column: ORDERS.CREATED_AT.column(),
      value: CELL_VALUE,
    });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    it("should return correct action titles", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(({ dateTitle }) => ({
        title: dateTitle,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(
          (question.datasetQuery() as StructuredDatasetQuery).query,
        ).toEqual({
          "source-table": ORDERS.id,
          filter: [operator, ORDERS.CREATED_AT.reference(), CELL_VALUE],
        });
        expect(question.display()).toBe("table");
      });
    });
  });

  describe("string cells", () => {
    const CELL_VALUE = "Joe";
    const { actions } = setup({
      question: PEOPLE.question(),
      column: PEOPLE.NAME.column(),
      value: CELL_VALUE,
    });

    it("should return correct filters", () => {
      const filters = OTHER_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    it("should return title with value for short values (<= 20 chars)", () => {
      expect(actions).toMatchObject([
        {
          title: `Is ${CELL_VALUE}`,
        },
        {
          title: `Is not ${CELL_VALUE}`,
        },
      ]);
    });

    it("should return title with value for long values (> 20 chars)", () => {
      const CELL_VALUE = "Some Long Text value longer than 20 chars";
      const { actions } = setup({
        question: PEOPLE.question(),
        column: PEOPLE.NAME.column(),
        value: CELL_VALUE,
      });

      expect(actions).toMatchObject([
        {
          title: `Is this`,
        },
        {
          title: `Is not this`,
        },
      ]);
    });

    actions.forEach((action, i) => {
      const { operator } = OTHER_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(
          (question.datasetQuery() as StructuredDatasetQuery).query,
        ).toEqual({
          "source-table": PEOPLE.id,
          filter: [operator, PEOPLE.NAME.reference(), CELL_VALUE],
        });
        expect(question.display()).toBe("table");
      });
    });
  });

  describe("long text cells", () => {
    const CELL_VALUE =
      "Enim consequatur voluptas temporibus iusto optio. Nihil et ea iste autem est. Accusamus sint corporis ullam.";
    const actions = QuickFilterDrill({
      question: REVIEWS.question(),
      clicked: {
        column: REVIEWS.BODY.column(),
        value: CELL_VALUE,
      },
    }) as PopoverClickAction[];

    it("should return correct filters", () => {
      const filters = LONG_TEXT_FILTERS.map(({ title, name }) => ({
        title,
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, index) => {
      it(`should show popover on "${action.name}" filter action click`, () => {
        expect(action.name).toBe(LONG_TEXT_FILTERS[index].name);
        const { popover: PopoverComponent } = action;

        const props = {
          series: [],
          onClick: jest.fn(),
          onChangeCardAndRun: jest.fn(),
          onChange: jest.fn(),
          onResize: jest.fn(),
          onClose: jest.fn(),
        };

        renderWithProviders(<PopoverComponent {...props} />);

        // sets filter value to clicked action type (Contains) and cell value
        expect(
          screen.getByText(LONG_TEXT_FILTERS[index].selectOptionTitle),
        ).toBeInTheDocument();
        const valueInput = screen.getByPlaceholderText("Enter some text");
        expect(valueInput).toBeInTheDocument();
        expect(valueInput).toHaveValue(CELL_VALUE);

        const applyButton = screen.getByText("Add filter");
        expect(applyButton).toBeInTheDocument();

        userEvent.click(applyButton);

        expect(props.onChangeCardAndRun).toHaveBeenCalledTimes(1);
        expect(props.onChangeCardAndRun).toHaveBeenCalledWith(
          expect.objectContaining({
            nextCard: expect.objectContaining({
              dataset_query: {
                database: 1,
                query: {
                  filter: [action.name, ["field", 29, null], CELL_VALUE],
                  "source-table": 4,
                },
                type: "query",
              },
              display: "table",
            }),
          }),
        );
      });
    });
  });

  describe("numeric cells, but not semantically numbers", () => {
    const { actions, cellValue } = setup({
      question: PEOPLE.question(),
      column: PEOPLE.ZIP.column(),
    });

    it("should return correct filters", () => {
      const filters = OTHER_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = OTHER_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(
          (question.datasetQuery() as StructuredDatasetQuery).query,
        ).toEqual({
          "source-table": PEOPLE.id,
          filter: [operator, PEOPLE.ZIP.reference(), cellValue],
        });
        expect(question.display()).toBe("table");
      });
    });
  });
});
