export const GAUGE_CHART_TYPE = "gauge";

// TODO: Clean up example data, as only certain keys are used.
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
