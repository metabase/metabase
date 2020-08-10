// TODO: To be replaced by an e2e test which doesn't require hardcoding the card objects

// HACK: Needed because of conflicts caused by circular dependencies
import "metabase/visualizations/components/Visualization";

import LineAreaBarChart from "metabase/visualizations/components/LineAreaBarChart.jsx";

const millisecondCard = {
  card: {
    description: null,
    archived: false,
    table_id: 1784,
    result_metadata: [
      {
        base_type: "type/BigInteger",
        display_name: "Timestamp",
        name: "timestamp",
        special_type: "type/UNIXTimestampMilliseconds",
        unit: "week",
      },
      {
        base_type: "type/Integer",
        display_name: "count",
        name: "count",
        special_type: "type/Number",
      },
    ],
    creator: {
      email: "atte@metabase.com",
      first_name: "Atte",
      last_login: "2017-07-21T17:51:23.181Z",
      is_qbnewb: false,
      is_superuser: true,
      id: 1,
      last_name: "Keinänen",
      date_joined: "2017-03-17T03:37:27.396Z",
      common_name: "Atte Keinänen",
    },
    database_id: 5,
    enable_embedding: false,
    collection_id: null,
    query_type: "query",
    name: "Toucan Incidents",
    query_average_duration: 501,
    creator_id: 1,
    updated_at: "2017-07-24T22:15:33.343Z",
    made_public_by_id: null,
    embedding_params: null,
    cache_ttl: null,
    dataset_query: {
      database: 5,
      type: "query",
      query: {
        "source-table": 1784,
        aggregation: [["count"]],
        breakout: [["datetime-field", ["field-id", 8159], "week"]],
      },
    },
    id: 83,
    display: "line",
    visualization_settings: {
      "graph.dimensions": ["timestamp"],
      "graph.metrics": ["severity"],
    },
    created_at: "2017-07-21T19:40:40.102Z",
    public_uuid: null,
  },
  data: {
    rows: [
      ["2015-05-31T00:00:00.000-07:00", 46],
      ["2015-06-07T00:00:00.000-07:00", 47],
      ["2015-06-14T00:00:00.000-07:00", 40],
      ["2015-06-21T00:00:00.000-07:00", 60],
      ["2015-06-28T00:00:00.000-07:00", 7],
    ],
    columns: ["timestamp", "count"],
    native_form: {
      query:
        "SELECT count(*) AS \"count\", (date_trunc('week', CAST((CAST((TIMESTAMP '1970-01-01T00:00:00Z' + ((\"schema_126\".\"sad_toucan_incidents_incidents\".\"timestamp\" / 1000) * INTERVAL '1 second')) AS timestamp) + INTERVAL '1 day') AS timestamp)) - INTERVAL '1 day') AS \"timestamp\" FROM \"schema_126\".\"sad_toucan_incidents_incidents\" GROUP BY (date_trunc('week', CAST((CAST((TIMESTAMP '1970-01-01T00:00:00Z' + ((\"schema_126\".\"sad_toucan_incidents_incidents\".\"timestamp\" / 1000) * INTERVAL '1 second')) AS timestamp) + INTERVAL '1 day') AS timestamp)) - INTERVAL '1 day') ORDER BY (date_trunc('week', CAST((CAST((TIMESTAMP '1970-01-01T00:00:00Z' + ((\"schema_126\".\"sad_toucan_incidents_incidents\".\"timestamp\" / 1000) * INTERVAL '1 second')) AS timestamp) + INTERVAL '1 day') AS timestamp)) - INTERVAL '1 day') ASC",
      params: null,
    },
    cols: [
      {
        description: null,
        table_id: 1784,
        schema_name: "schema_126",
        special_type: "type/UNIXTimestampMilliseconds",
        unit: "week",
        name: "timestamp",
        source: "breakout",
        remapped_from: null,
        fk_field_id: null,
        remapped_to: null,
        id: 8159,
        visibility_type: "normal",
        target: null,
        display_name: "Timestamp",
        base_type: "type/BigInteger",
      },
      {
        description: null,
        table_id: null,
        special_type: "type/Number",
        name: "count",
        source: "aggregation",
        remapped_from: null,
        remapped_to: null,
        id: null,
        target: null,
        display_name: "count",
        base_type: "type/Integer",
      },
    ],
    results_metadata: {
      checksum: "H2XV8wuuBkFrxukvDt+Ehw==",
      columns: [
        {
          base_type: "type/BigInteger",
          display_name: "Timestamp",
          name: "timestamp",
          special_type: "type/UNIXTimestampMilliseconds",
          unit: "week",
        },
        {
          base_type: "type/Integer",
          display_name: "count",
          name: "count",
          special_type: "type/Number",
        },
      ],
    },
  },
};

const dateTimeCard = {
  card: {
    description: null,
    archived: false,
    table_id: 1,
    result_metadata: [
      {
        base_type: "type/DateTime",
        display_name: "Created At",
        name: "CREATED_AT",
        description: "The date and time an order was submitted.",
        unit: "month",
      },
      {
        base_type: "type/Float",
        display_name: "sum",
        name: "sum",
        special_type: "type/Number",
      },
    ],
    creator: {
      email: "atte@metabase.com",
      first_name: "Atte",
      last_login: "2017-07-21T17:51:23.181Z",
      is_qbnewb: false,
      is_superuser: true,
      id: 1,
      last_name: "Keinänen",
      date_joined: "2017-03-17T03:37:27.396Z",
      common_name: "Atte Keinänen",
    },
    database_id: 1,
    enable_embedding: false,
    collection_id: null,
    query_type: "query",
    name: "Orders over time",
    query_average_duration: 798,
    creator_id: 1,
    updated_at: "2017-07-24T22:15:33.603Z",
    made_public_by_id: null,
    embedding_params: null,
    cache_ttl: null,
    dataset_query: {
      database: 1,
      type: "query",
      query: {
        "source-table": 1,
        aggregation: [["sum", ["field-id", 4]]],
        breakout: [["datetime-field", ["field-id", 1], "month"]],
      },
    },
    id: 25,
    display: "line",
    visualization_settings: {
      "graph.colors": [
        "#F1B556",
        "#9cc177",
        "#a989c5",
        "#ef8c8c",
        "#f9d45c",
        "#F1B556",
        "#A6E7F3",
        "#7172AD",
        "#7B8797",
        "#6450e3",
        "#55e350",
        "#e35850",
        "#77c183",
        "#7d77c1",
        "#c589b9",
        "#bec589",
        "#89c3c5",
        "#c17777",
        "#899bc5",
        "#efce8c",
        "#50e3ae",
        "#be8cef",
        "#8cefc6",
        "#ef8cde",
        "#b5f95c",
        "#5cc2f9",
        "#f95cd0",
        "#c1a877",
        "#f95c67",
      ],
    },
    created_at: "2017-04-13T21:47:08.360Z",
    public_uuid: null,
  },
  data: {
    rows: [
      ["2015-09-01T00:00:00.000-07:00", 533.45],
      ["2015-10-01T00:00:00.000-07:00", 4130.049999999998],
      ["2015-11-01T00:00:00.000-07:00", 6786.2599999999975],
      ["2015-12-01T00:00:00.000-08:00", 12494.039999999994],
      ["2016-01-01T00:00:00.000-08:00", 13594.169999999995],
      ["2016-02-01T00:00:00.000-08:00", 16607.429999999997],
      ["2016-03-01T00:00:00.000-08:00", 23600.45000000002],
      ["2016-04-01T00:00:00.000-07:00", 24051.120000000024],
      ["2016-05-01T00:00:00.000-07:00", 30163.87000000002],
      ["2016-06-01T00:00:00.000-07:00", 30547.53000000002],
      ["2016-07-01T00:00:00.000-07:00", 35808.49000000004],
      ["2016-08-01T00:00:00.000-07:00", 43856.760000000075],
      ["2016-09-01T00:00:00.000-07:00", 42831.96000000008],
      ["2016-10-01T00:00:00.000-07:00", 50299.75000000006],
      ["2016-11-01T00:00:00.000-07:00", 51861.37000000006],
      ["2016-12-01T00:00:00.000-08:00", 55982.590000000106],
      ["2017-01-01T00:00:00.000-08:00", 64462.70000000016],
      ["2017-02-01T00:00:00.000-08:00", 58228.17000000016],
      ["2017-03-01T00:00:00.000-08:00", 65618.70000000017],
      ["2017-04-01T00:00:00.000-07:00", 66682.43000000018],
      ["2017-05-01T00:00:00.000-07:00", 71817.04000000012],
      ["2017-06-01T00:00:00.000-07:00", 72691.63000000018],
      ["2017-07-01T00:00:00.000-07:00", 86210.1600000002],
      ["2017-08-01T00:00:00.000-07:00", 81121.41000000008],
      ["2017-09-01T00:00:00.000-07:00", 24811.320000000007],
    ],
    columns: ["CREATED_AT", "sum"],
    native_form: {
      query:
        'SELECT sum("PUBLIC"."ORDERS"."SUBTOTAL") AS "sum", parsedatetime(formatdatetime("PUBLIC"."ORDERS"."CREATED_AT", \'yyyyMM\'), \'yyyyMM\') AS "CREATED_AT" FROM "PUBLIC"."ORDERS" GROUP BY parsedatetime(formatdatetime("PUBLIC"."ORDERS"."CREATED_AT", \'yyyyMM\'), \'yyyyMM\') ORDER BY parsedatetime(formatdatetime("PUBLIC"."ORDERS"."CREATED_AT", \'yyyyMM\'), \'yyyyMM\') ASC',
      params: null,
    },
    cols: [
      {
        description: "The date and time an order was submitted.",
        table_id: 1,
        schema_name: "PUBLIC",
        special_type: null,
        unit: "month",
        name: "CREATED_AT",
        source: "breakout",
        remapped_from: null,
        fk_field_id: null,
        remapped_to: null,
        id: 1,
        visibility_type: "normal",
        target: null,
        display_name: "Created At",
        base_type: "type/DateTime",
      },
      {
        description: null,
        table_id: null,
        special_type: "type/Number",
        name: "sum",
        source: "aggregation",
        remapped_from: null,
        remapped_to: null,
        id: null,
        target: null,
        display_name: "sum",
        base_type: "type/Float",
      },
    ],
    results_metadata: {
      checksum: "XIqamTTUJ9nbWlTwKc8Bpg==",
      columns: [
        {
          base_type: "type/DateTime",
          display_name: "Created At",
          name: "CREATED_AT",
          description: "The date and time an order was submitted.",
          unit: "month",
        },
        {
          base_type: "type/Float",
          display_name: "sum",
          name: "sum",
          special_type: "type/Number",
        },
      ],
    },
  },
};

const numberCard = {
  card: {
    description: null,
    archived: false,
    labels: [],
    table_id: 4,
    result_metadata: [
      {
        base_type: "type/Integer",
        display_name: "Ratings",
        name: "RATING",
        description: "The rating (on a scale of 1-5) the user left.",
        special_type: "type/Number",
      },
      {
        base_type: "type/Integer",
        display_name: "count",
        name: "count",
        special_type: "type/Number",
      },
    ],
    creator: {
      email: "atte@metabase.com",
      first_name: "Atte",
      last_login: "2017-07-21T17:51:23.181Z",
      is_qbnewb: false,
      is_superuser: true,
      id: 1,
      last_name: "Keinänen",
      date_joined: "2017-03-17T03:37:27.396Z",
      common_name: "Atte Keinänen",
    },
    database_id: 1,
    enable_embedding: false,
    collection_id: 2,
    query_type: "query",
    name: "Reviews by Rating",
    creator_id: 1,
    updated_at: "2017-07-24T22:15:29.911Z",
    made_public_by_id: null,
    embedding_params: null,
    cache_ttl: null,
    dataset_query: {
      database: 1,
      type: "query",
      query: {
        "source-table": 4,
        aggregation: [["count"]],
        breakout: [["field-id", 33]],
      },
    },
    id: 86,
    display: "line",
    visualization_settings: {},
    collection: {
      id: 2,
      name: "Order Statistics",
      slug: "order_statistics",
      description: null,
      color: "#7B8797",
      archived: false,
    },
    favorite: false,
    created_at: "2017-07-24T22:15:29.911Z",
    public_uuid: null,
  },
  data: {
    rows: [[1, 59], [2, 77], [3, 64], [4, 550], [5, 328]],
    columns: ["RATING", "count"],
    native_form: {
      query:
        'SELECT count(*) AS "count", "PUBLIC"."REVIEWS"."RATING" AS "RATING" FROM "PUBLIC"."REVIEWS" GROUP BY "PUBLIC"."REVIEWS"."RATING" ORDER BY "PUBLIC"."REVIEWS"."RATING" ASC',
      params: null,
    },
    cols: [
      {
        description: "The rating (on a scale of 1-5) the user left.",
        table_id: 4,
        schema_name: "PUBLIC",
        special_type: "type/Number",
        name: "RATING",
        source: "breakout",
        remapped_from: null,
        fk_field_id: null,
        remapped_to: null,
        id: 33,
        visibility_type: "normal",
        target: null,
        display_name: "Ratings",
        base_type: "type/Integer",
      },
      {
        description: null,
        table_id: null,
        special_type: "type/Number",
        name: "count",
        source: "aggregation",
        remapped_from: null,
        remapped_to: null,
        id: null,
        target: null,
        display_name: "count",
        base_type: "type/Integer",
      },
    ],
    results_metadata: {
      checksum: "jTfxUHHttR31J8lQBqJ/EA==",
      columns: [
        {
          base_type: "type/Integer",
          display_name: "Ratings",
          name: "RATING",
          description: "The rating (on a scale of 1-5) the user left.",
          special_type: "type/Number",
        },
        {
          base_type: "type/Integer",
          display_name: "count",
          name: "count",
          special_type: "type/Number",
        },
      ],
    },
  },
};

describe("LineAreaBarChart", () => {
  it("should let you combine series with datetimes only", () => {
    expect(
      LineAreaBarChart.seriesAreCompatible(dateTimeCard, dateTimeCard),
    ).toBe(true);
  });
  it("should let you combine series with UNIX millisecond timestamps only", () => {
    expect(
      LineAreaBarChart.seriesAreCompatible(dateTimeCard, dateTimeCard),
    ).toBe(true);
  });
  it("should let you combine series with numbers only", () => {
    expect(LineAreaBarChart.seriesAreCompatible(numberCard, numberCard)).toBe(
      true,
    );
  });
  it("should let you combine series with UNIX millisecond timestamps and datetimes", () => {
    expect(
      LineAreaBarChart.seriesAreCompatible(millisecondCard, dateTimeCard),
    ).toBe(true);
    expect(
      LineAreaBarChart.seriesAreCompatible(dateTimeCard, millisecondCard),
    ).toBe(true);
  });
  it("should not let you combine series with UNIX millisecond timestamps and numbers", () => {
    expect(
      LineAreaBarChart.seriesAreCompatible(numberCard, millisecondCard),
    ).toBe(false);
    expect(
      LineAreaBarChart.seriesAreCompatible(millisecondCard, numberCard),
    ).toBe(false);
  });
  it("should not let you combine series with datetimes and numbers", () => {
    expect(LineAreaBarChart.seriesAreCompatible(numberCard, dateTimeCard)).toBe(
      false,
    );
    expect(LineAreaBarChart.seriesAreCompatible(dateTimeCard, numberCard)).toBe(
      false,
    );
  });
});
