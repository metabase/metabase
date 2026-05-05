export const ZERO = {
  rawSeries: [
    {
      data: {
        cols: [
          {
            name: "value",
            display_name: "Value",
            base_type: "type/Number",
            semantic_type: "type/Number",
          },
        ],
        rows: [[0]],
      },
      card: {
        display: "progress",
        visualization_settings: {
          "progress.goal": 100000,
          "progress.color": "#84BB4C",
          column_settings: {
            '["name","value"]': {
              number_style: "currency",
              currency: "USD",
              currency_style: "symbol",
              decimals: 0,
            },
          },
        },
      },
    },
  ],
  renderingContext: {
    getColor: (color: string) => (color === "accent1" ? "#509EE3" : color),
  },
};

export const BELOW_GOAL = {
  rawSeries: [
    {
      data: {
        cols: [
          {
            name: "value",
            display_name: "Value",
            base_type: "type/Number",
            semantic_type: "type/Number",
          },
        ],
        rows: [[30000]],
      },
      card: {
        display: "progress",
        visualization_settings: {
          "progress.goal": 100000,
          "progress.color": "#84BB4C",
          column_settings: {
            '["name","value"]': {
              number_style: "currency",
              currency: "USD",
              currency_style: "symbol",
              decimals: 0,
            },
          },
        },
      },
    },
  ],
  renderingContext: {
    getColor: (color: string) => (color === "accent1" ? "#509EE3" : color),
  },
};

export const REACHED_GOAL = {
  rawSeries: [
    {
      data: {
        cols: [
          {
            name: "value",
            display_name: "Value",
            base_type: "type/Number",
            semantic_type: "type/Number",
          },
        ],
        rows: [[100000]],
      },
      card: {
        display: "progress",
        visualization_settings: {
          "progress.goal": 100000,
          "progress.color": "#84BB4C",
          column_settings: {
            '["name","value"]': {
              number_style: "currency",
              currency: "USD",
              currency_style: "symbol",
              decimals: 0,
            },
          },
        },
      },
    },
  ],
  renderingContext: {
    getColor: (color: string) => (color === "accent1" ? "#509EE3" : color),
  },
};

export const EXCEEDS_GOAL = {
  rawSeries: [
    {
      data: {
        cols: [
          {
            name: "value",
            display_name: "Value",
            base_type: "type/Number",
            semantic_type: "type/Number",
          },
        ],
        rows: [[135000]],
      },
      card: {
        display: "progress",
        visualization_settings: {
          "progress.goal": 100000,
          "progress.color": "#84BB4C",
          column_settings: {
            '["name","value"]': {
              number_style: "currency",
              currency: "USD",
              currency_style: "symbol",
              decimals: 0,
            },
          },
        },
      },
    },
  ],
  renderingContext: {
    getColor: (color: string) => (color === "accent1" ? "#509EE3" : color),
  },
};
