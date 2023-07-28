import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
} from "metabase-types/api/mocks/presets";
import {
  DatasetColumn,
  DatetimeUnit,
  StructuredDatasetQuery,
} from "metabase-types/api";
import type { ClickObject } from "metabase/modes/types";
import { checkNotNull } from "metabase/core/utils/types";
import type Question from "metabase-lib/Question";
import ZoomDrill from "./ZoomDrill";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = checkNotNull(metadata.table(ORDERS_ID));

describe("ZoomDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(ZoomDrill({ question: ordersTable.newQuestion() })).toHaveLength(0);
  });

  it("should return correct new breakout value for month -> week", () => {
    const actions = ZoomDrill(setupDateFieldQuery("month"));

    expect(actions).toHaveLength(1);

    const action = actions[0];
    const question = action.question();
    expect((question.datasetQuery() as StructuredDatasetQuery).query).toEqual({
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      filter: [
        "=",
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        "2018-01-01T00:00:00Z",
      ],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
    });
    expect(question.display()).toEqual("line");
  });

  it("should return correct new breakout value for state -> map", () => {
    const actions = ZoomDrill(setupCategoryFieldQuery());

    expect(actions).toHaveLength(1);

    const action = actions[0];
    const question = action.question();
    expect((question.datasetQuery() as StructuredDatasetQuery).query).toEqual({
      "source-table": PEOPLE_ID,
      aggregation: [["count"]],
      filter: ["=", ["field", PEOPLE.STATE, null], "TX"],
      breakout: [
        [
          "field",
          PEOPLE.LATITUDE,
          {
            binning: {
              "bin-width": 1,
              strategy: "bin-width",
            },
          },
        ],
        [
          "field",
          PEOPLE.LONGITUDE,
          {
            binning: {
              "bin-width": 1,
              strategy: "bin-width",
            },
          },
        ],
      ],
    });
    expect(question.display()).toEqual("map");
  });

  describe("title", () => {
    it.each<[DatetimeUnit, DatetimeUnit]>([
      ["year", "quarter"],
      ["month", "week"],
      ["week", "day"],
    ])(
      "should return specific title for date field: %s -> %s",
      (granularity, newGranularity) => {
        const actions = ZoomDrill(setupDateFieldQuery(granularity));

        expect(actions).toHaveLength(1);

        const action = actions[0];
        expect(action.title).toBe(
          `See this ${granularity} by ${newGranularity}`,
        );
      },
    );

    it("should return generic title for drillable non-date field", () => {
      const actions = ZoomDrill(setupCategoryFieldQuery());

      expect(actions).toHaveLength(1);

      const action = actions[0];
      expect(action.title).toBe(`Zoom in`);
    });
  });
});

function setupDateFieldQuery(temporalUnit: DatetimeUnit): {
  question: Question;
  clicked: ClickObject;
} {
  const ordersTable = checkNotNull(metadata.table(ORDERS_ID));
  const peopleCreatedAtField = checkNotNull(metadata.field(ORDERS.CREATED_AT));

  const query = ordersTable
    .query()
    .aggregate(["count"])
    .breakout(["field", ORDERS.CREATED_AT, { "temporal-unit": temporalUnit }]);

  const question = query.question();

  const clicked = {
    column: peopleCreatedAtField.column(),
    value: 42,
    dimensions: [
      {
        column: peopleCreatedAtField
          .dimension()
          .withTemporalUnit(temporalUnit)
          .column() as DatasetColumn,
        value: "2018-01-01T00:00:00Z",
      },
    ],
  };

  return { question, clicked };
}

function setupCategoryFieldQuery() {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  const peopleTable = checkNotNull(metadata.table(PEOPLE_ID));
  const peopleStateField = checkNotNull(metadata.field(PEOPLE.STATE));

  const query = peopleTable
    .query()
    .aggregate(["count"])
    .breakout(["field", PEOPLE.STATE, null]);

  const question = query.question();

  const clicked = {
    column: peopleStateField.column(),
    value: 194,
    dimensions: [
      {
        column: peopleStateField.dimension().column() as DatasetColumn,
        value: "TX",
      },
    ],
  };

  return { question, clicked };
}
