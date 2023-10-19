import type { FunnelProps } from "metabase/static-viz/components/FunnelChart/FunnelChart";

export const DEFAULT: FunnelProps = {
  data: [
    ["Visitors", 1000],
    ["Started sign up", 300],
    ["Finished sign up", 200],
    ["Opened app", 195],
    ["Finished onboarding", 150],
    ["Activated", 25],
  ],
  settings: {
    step: {
      name: "Step",
    },
    measure: {
      format: {
        suffix: "k",
      },
    },
    colors: {
      textMedium: "#949aab",
      brand: "#509ee3",
      border: "#f0f0f0",
    },
    visualization_settings: {},
  },
};
