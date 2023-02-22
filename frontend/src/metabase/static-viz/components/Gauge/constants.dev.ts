export const GAUGE_CHART_DEFAULT_OPTIONS = {
  card: {
    visualization_settings: {
      "gauge.segments": [
        {
          min: 0,
          max: 9380,
          color: "#ED6E6E",
          label: "Label 1",
        },
        {
          min: 9380,
          max: 18760,
          color: "#F9CF48",
          label: "Label 2",
        },
        {
          min: 18760,
          max: 37520,
          color: "#84BB4C",
          label: "Label 3",
        },
      ],
    },
  },
  data: {
    rows: [[18760]],
  },
};

export const GAUGE_CHART_WITH_COLUMN_SETTINGS_OPTIONS = {
  card: {
    visualization_settings: {
      "gauge.segments": [
        {
          min: 0,
          max: 9380,
          color: "#ED6E6E",
          label: "Label 1",
        },
        {
          min: 9380,
          max: 18760,
          color: "#F9CF48",
          label: "Label 2",
        },
        {
          min: 18760,
          max: 37520,
          color: "#84BB4C",
          label: "Label 3",
        },
      ],
      column_settings: {
        '["name","count"]': {
          number_style: "currency",
          number_separators: ".’",
          scale: 2,
          prefix: "<",
          suffix: ">",
          decimals: 1,
        },
      },
    },
  },
  data: {
    rows: [[18760]],
  },
};
