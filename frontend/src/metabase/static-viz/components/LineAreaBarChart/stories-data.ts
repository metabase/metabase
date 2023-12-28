import _ from "underscore";

export const LINE_TWO_BARS = {
  settings: {
    show_values: true,
    goal: {
      value: 140,
      label: "Goal",
    },
    x: {
      type: "timeseries",
    },
    y: {
      type: "linear",
    },
    labels: {
      left: "Count",
      right: "Sum",
      bottom: "Date",
    },
    visualization_settings: {},
  },
  multipleSeries: [
    [
      {
        cardName: "line series",
        yAxisPosition: "left",
        type: "line",
        data: [
          ["2020-10-20", 15],
          ["2020-10-21", 20],
          ["2020-10-22", 35],
          ["2020-10-23", 40],
          ["2020-10-24", 55],
          ["2020-10-25", 60],
          ["2020-10-26", 75],
          ["2020-10-27", 80],
          ["2020-10-28", 95],
        ],
        column: {
          semantic_type: "type/CreationTimestamp",
          unit: "year",
          name: "CREATED_AT",
          source: "breakout",
          display_name: "Created At",
        },
        breakoutValue: "2020-01-01T00:00:00Z",
      },
    ],
    [
      {
        cardName: "bar series 1",
        yAxisPosition: "left",
        type: "bar",
        data: [
          ["2020-10-20", 90],
          ["2020-10-21", 80],
          ["2020-10-22", 70],
          ["2020-10-23", 60],
          ["2020-10-24", 50],
          ["2020-10-25", 40],
          ["2020-10-26", 30],
          ["2020-10-27", 20],
          ["2020-10-28", 10],
        ],
        column: {
          semantic_type: "type/CreationTimestamp",
          unit: "year",
          name: "CREATED_AT",
          source: "breakout",
          display_name: "Created At",
        },
        breakoutValue: "2020-01-01T00:00:00Z",
      },
    ],
    [
      {
        cardName: "bar series 2 with a really really really long name",
        yAxisPosition: "right",
        type: "bar",
        data: [
          ["2020-10-20", 4],
          ["2020-10-21", 5],
          ["2020-10-22", 6],
          ["2020-10-23", 7],
          ["2020-10-24", 6],
          ["2020-10-25", 5],
          ["2020-10-26", 4],
          ["2020-10-27", 3],
          ["2020-10-28", 2],
        ],
        column: {
          semantic_type: "type/CreationTimestamp",
          unit: "year",
          name: "CREATED_AT",
          source: "breakout",
          display_name: "Created At",
        },
        breakoutValue: "2020-01-01T00:00:00Z",
      },
    ],
    [
      {
        cardName: "area series",
        yAxisPosition: "right",
        type: "area",
        data: [
          ["2020-10-20", 4],
          ["2020-10-21", 5],
          ["2020-10-22", 3],
          ["2020-10-23", 4],
          ["2020-10-24", 5],
          ["2020-10-25", 8],
          ["2020-10-26", 9],
          ["2020-10-27", 12],
          ["2020-10-28", 15],
        ],
        column: {
          semantic_type: "type/CreationTimestamp",
          unit: "year",
          name: "CREATED_AT",
          source: "breakout",
          display_name: "Created At",
        },
        breakoutValue: "2020-01-01T00:00:00Z",
      },
    ],
  ],
};

export const LINE_BAR_AREA = {
  settings: {
    x: {
      type: "timeseries",
    },
    y: {
      type: "linear",
      format: {
        number_style: "currency",
        currency: "USD",
        currency_style: "symbol",
        decimals: 2,
      },
    },
    labels: {
      right: "Sum",
      bottom: "Date",
    },
    visualization_settings: {},
  },
  multipleSeries: [
    [
      {
        cardName: "line series",
        yAxisPosition: "right",
        type: "line",
        data: [
          ["2020-10-18", -65],
          ["2020-10-19", -55],
          ["2020-10-20", -45],
          ["2020-10-21", -30],
          ["2020-10-22", -25],
          ["2020-10-23", -10],
          ["2020-10-24", 0],
          ["2020-10-25", 10],
          ["2020-10-26", 20],
          ["2020-10-27", 80],
        ],
        column: {
          semantic_type: "type/CreationTimestamp",
          unit: "year",
          name: "CREATED_AT",
          source: "breakout",
          display_name: "Created At",
        },
        breakoutValue: "2020-01-01T00:00:00Z",
      },
    ],
    [
      {
        cardName: "bar series",
        yAxisPosition: "right",
        type: "bar",
        data: [
          ["2020-10-20", -90],
          ["2020-10-21", -80],
          ["2020-10-22", -70],
          ["2020-10-23", -60],
          ["2020-10-24", 10],
          ["2020-10-25", 20],
          ["2020-10-26", 30],
          ["2020-10-27", 40],
          ["2020-10-28", 50],
        ],
        column: {
          semantic_type: "type/CreationTimestamp",
          unit: "year",
          name: "CREATED_AT",
          source: "breakout",
          display_name: "Created At",
        },
        breakoutValue: "2020-01-01T00:00:00Z",
      },
    ],
    [
      {
        cardName: "area series",
        yAxisPosition: "right",
        type: "area",
        data: [
          ["2020-10-22", 13],
          ["2020-10-23", 10],
          ["2020-10-24", 5],
          ["2020-10-25", -8],
          ["2020-10-26", -9],
          ["2020-10-27", -22],
          ["2020-10-28", -85],
          ["2020-10-29", -100],
          ["2020-10-30", -120],
        ],
        column: {
          semantic_type: "type/CreationTimestamp",
          unit: "year",
          name: "CREATED_AT",
          source: "breakout",
          display_name: "Created At",
        },
        breakoutValue: "2020-01-01T00:00:00Z",
      },
    ],
  ],
};

export const CATEGORICAL_LINE_BAR = {
  settings: {
    goal: {
      value: 120,
      label: "Goal",
    },
    x: {
      type: "ordinal",
    },
    y: {
      type: "linear",
    },
    labels: {
      left: "Count",
      right: "Sum",
      bottom: "Date",
    },
    visualization_settings: {},
  },
  multipleSeries: [
    [
      {
        cardName: "line series",
        yAxisPosition: "left",
        type: "line",
        data: [
          ["Alden Sparks", 70],
          ["Areli Guerra", 30],
          ["Arturo Hopkins", 80],
          ["Beatrice Lane", 120],
          ["Brylee Davenport", 100],
          ["Cali Nixon", 60],
          ["Dane Terrell", 150],
          ["Deshawn Rollins", 40],
          ["Isabell Bright", 70],
          ["Kaya Rowe", 20],
          ["Roderick Herman", 50],
          ["Ruth Dougherty", 75],
        ],
        column: {
          name: "count",
          source: "aggregation",
          display_name: "Count",
        },
      },
      {
        cardName: "bar series 1",
        yAxisPosition: "left",
        type: "bar",
        data: [
          ["Alden Sparks", 20],
          ["Areli Guerra", 80],
          ["Arturo Hopkins", 10],
          ["Beatrice Lane", 10],
          ["Brylee Davenport", 15],
          ["Cali Nixon", 20],
          ["Dane Terrell", 40],
          ["Deshawn Rollins", 60],
          ["Isabell Bright", 80],
          ["Kaya Rowe", 50],
          ["Roderick Herman", 40],
          ["Ruth Dougherty", 65],
        ],
        column: {
          name: "sum",
          source: "aggregation",
          display_name: "Sum",
        },
      },
    ],
  ],
};

export const TIMESERIES_WITH_NEGATIVE_DATA = {
  settings: {
    stacking: "stack",
    x: {
      type: "timeseries",
    },
    y: {
      type: "linear",
      format: {
        number_style: "currency",
        currency: "USD",
        currency_style: "symbol",
        decimals: 2,
      },
    },
    labels: {
      left: "Sum",
      bottom: "Date",
    },
    visualization_settings: {},
  },
  multipleSeries: [
    [
      {
        cardName: "series 1",
        yAxisPosition: "left",
        type: "area",
        data: [
          ["2020-10-18", 10],
          ["2020-10-19", 20],
          ["2020-10-20", 30],
          ["2020-10-21", 40],
          ["2020-10-22", 45],
          ["2020-10-23", 55],
        ],
        column: {
          semantic_type: "type/CreationTimestamp",
          unit: "year",
          name: "CREATED_AT",
          source: "breakout",
          display_name: "Created At",
        },
        breakoutValue: "2020-01-01T00:00:00Z",
      },
    ],
    [
      {
        cardName: "series 2",
        yAxisPosition: "left",
        type: "area",
        data: [
          ["2020-10-18", 10],
          ["2020-10-19", 40],
          ["2020-10-20", 80],
          ["2020-10-21", 60],
          ["2020-10-22", 70],
          ["2020-10-23", 65],
        ],
        column: {
          semantic_type: "type/CreationTimestamp",
          unit: "year",
          name: "CREATED_AT",
          source: "breakout",
          display_name: "Created At",
        },
        breakoutValue: "2020-01-01T00:00:00Z",
      },
    ],
    [
      {
        cardName: "series 3",
        yAxisPosition: "left",
        type: "area",
        data: [
          ["2020-10-18", -40],
          ["2020-10-19", -20],
          ["2020-10-20", -10],
          ["2020-10-21", -20],
          ["2020-10-22", -45],
          ["2020-10-23", -55],
        ],
        column: {
          semantic_type: "type/CreationTimestamp",
          unit: "year",
          name: "CREATED_AT",
          source: "breakout",
          display_name: "Created At",
        },
        breakoutValue: "2020-01-01T00:00:00Z",
      },
    ],
    [
      {
        cardName: "series 4",
        yAxisPosition: "left",
        type: "area",
        data: [
          ["2020-10-18", -40],
          ["2020-10-19", -50],
          ["2020-10-20", -60],
          ["2020-10-21", -20],
          ["2020-10-22", -10],
          ["2020-10-23", -5],
        ],
        column: {
          semantic_type: "type/CreationTimestamp",
          unit: "year",
          name: "CREATED_AT",
          source: "breakout",
          display_name: "Created At",
        },
        breakoutValue: "2020-01-01T00:00:00Z",
      },
    ],
  ],
};

export const SINGLE_SERIES_BAR = {
  settings: {
    x: {
      type: "ordinal",
    },
    y: {
      type: "linear",
    },
    labels: {
      left: "Count",
      bottom: "Date",
    },
    visualization_settings: {},
  },
  multipleSeries: [
    [
      {
        cardName: "bar series",
        yAxisPosition: "left",
        type: "bar",
        data: _.range(48).map(n => [`bar ${n + 1}`, n + 1]),
        column: {
          name: "count",
          source: "aggregation",
          display_name: "Count",
        },
      },
    ],
  ],
};

export const SINGLE_SERIES_MANY_BARS = {
  settings: {
    x: {
      type: "ordinal",
    },
    y: {
      type: "linear",
    },
    labels: {
      left: "Count",
      bottom: "Date",
    },
    visualization_settings: {},
  },
  multipleSeries: [
    [
      {
        cardName: "bar series",
        yAxisPosition: "left",
        type: "bar",
        data: _.range(200).map(n => [`bar ${n + 1}`, n + 1]),
        column: {
          name: "count",
          source: "aggregation",
          display_name: "Count",
        },
      },
    ],
  ],
};
