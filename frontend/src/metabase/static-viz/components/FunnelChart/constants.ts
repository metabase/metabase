export const FUNNEL_CHART_TYPE = "funnel";

export const FUNNEL_CHART_DEFAULT_OPTIONS = {
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
  },
};
