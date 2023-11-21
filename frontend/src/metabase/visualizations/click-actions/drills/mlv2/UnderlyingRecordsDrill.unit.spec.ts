import {
  createPeopleStateField,
  PEOPLE,
  PEOPLE_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import type * as Lib from "metabase-lib";
import type { QuestionChangeClickAction } from "metabase/visualizations/types";
import {
  createMockColumn,
  createMockCustomColumn,
} from "metabase-types/api/mocks";
import type { DatasetColumn, RowValue } from "metabase-types/api";
import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import {
  getAvailableDrillByType,
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/Question";
import { UnderlyingRecordsDrill } from "./UnderlyingRecordsDrill";

describe("UnderlyingRecordsDrill", () => {
  describe("title", () => {
    it('should return "See these records" title for entities with title longer than 20 chars', () => {
      const action = setup(
        getQuestionWithCustomTableName("LongLongLongLongLongLongLongTableName"),
      );

      expect(action.title).toEqual("See these records");
    });

    it("should contain entity title for entities shorter than 21 chars", () => {
      const action = setup(getQuestionWithCustomTableName("SomeTitle"));

      expect(action.title).toEqual("See these SomeTitles");
    });

    // NOTE: this test is valid only until lib drill returns metric value instead of underlying rows count
    it("should return correct pluralized title for negative numeric values (metabase#32108)", () => {
      const action = setup({
        question: Question.create({
          metadata: SAMPLE_METADATA,
          dataset_query: {
            database: SAMPLE_DB_ID,
            type: "query",
            query: {
              aggregation: [
                [
                  "sum",
                  [
                    "field",
                    PEOPLE.LATITUDE,
                    {
                      "base-type": "type/Float",
                    },
                  ],
                ],
              ],
              breakout: [
                [
                  "field",
                  PEOPLE.STATE,
                  {
                    "base-type": "type/Text",
                  },
                ],
              ],
              "source-table": PEOPLE_ID,
            },
          },
        }),
        clickedColumnName: "sum",
        columns: {
          STATE: createMockColumn({
            ...createPeopleStateField(),
            id: PEOPLE.STATE,
            source: "breakout",
            field_ref: [
              "field",
              PEOPLE.STATE,
              {
                "base-type": "type/Text",
              },
            ],
          }),
          sum: createMockCustomColumn({
            base_type: "type/Float",
            name: "sum",
            display_name: "Sum of Latitude",
            source: "aggregation",
            field_ref: ["aggregation", 0],
            effective_type: "type/Float",
          }),
        },
        rowValues: {
          STATE: "AK",
          sum: -1000,
        },
      });

      expect(action.title).toEqual("See these People");
    });
  });
});

function setup({
  question,
  clickedColumnName,
  columns,
  rowValues,
}: {
  question: Question;
  clickedColumnName: string;
  columns: Record<string, DatasetColumn>;
  rowValues: Record<string, RowValue>;
}): QuestionChangeClickAction {
  const { drill, drillDisplayInfo } = getAvailableDrillByType({
    question,
    clickedColumnName,
    columns,
    rowValues,
    clickType: "cell",
    drillType: "drill-thru/underlying-records",
  });

  const typedDrillDisplayInfo =
    drillDisplayInfo as Lib.UnderlyingRecordsDrillThruInfo;

  const actions = UnderlyingRecordsDrill({
    question,
    drill,
    drillDisplayInfo: typedDrillDisplayInfo,
    applyDrill: jest.fn(),
  });

  expect(actions).toHaveLength(1);
  expect(actions[0].name).toBe("underlying-records");

  return actions[0] as QuestionChangeClickAction;
}

function getQuestionWithCustomTableName(tableName: string) {
  const metadata = createMockMetadata({ databases: [SAMPLE_DATABASE] });
  const table = checkNotNull(metadata.table(PEOPLE_ID));

  table.display_name = tableName;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - patching readonly field for tests
  table._plainObject.display_name = tableName;

  return {
    question: Question.create({
      metadata: metadata,
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              PEOPLE.STATE,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "month",
              },
            ],
          ],
        },
      },
    }),
    clickedColumnName: "count",
    columns: {
      STATE: createMockColumn({
        ...createPeopleStateField(),
        id: PEOPLE.STATE,
        source: "breakout",
        field_ref: [
          "field",
          PEOPLE.STATE,
          {
            "base-type": "type/Text",
          },
        ],
      }),
      count: createMockCustomColumn({
        base_type: "type/BigInteger",
        name: "count",
        display_name: "Count",
        semantic_type: "type/Quantity",
        source: "aggregation",
        field_ref: ["aggregation", 0],
        effective_type: "type/BigInteger",
      }),
    },
    rowValues: {
      STATE: "AK",
      count: 10,
    },
  };
}
