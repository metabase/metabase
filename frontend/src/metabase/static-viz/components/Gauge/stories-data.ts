import type { GaugeContainerProps } from "metabase/static-viz/components/Gauge/GaugeContainer";

export const DEFAULT: Omit<GaugeContainerProps, "getColor"> = {
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

export const WITH_FORMATTING: Omit<GaugeContainerProps, "getColor"> = {
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

export const TRUNCATED_LABELS: Omit<GaugeContainerProps, "getColor"> = {
  card: {
    visualization_settings: {
      "gauge.segments": [
        {
          min: 0,
          max: 9380,
          color: "#ED6E6E",
          label: "The quick brown fox jumps over the lazy dog.",
        },
        {
          min: 9380,
          max: 18760,
          color: "#F9CF48",
          label: "The quick brown fox jumps over the lazy dog.",
        },
        {
          min: 18760,
          max: 37520,
          color: "#84BB4C",
          label: "The quick brown fox jumps over the lazy dog.",
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
